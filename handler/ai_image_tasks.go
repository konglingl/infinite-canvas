package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/google/uuid"
)

const (
	aiImageTaskStatusQueued    = "queued"
	aiImageTaskStatusRunning   = "running"
	aiImageTaskStatusSucceeded = "succeeded"
	aiImageTaskStatusFailed    = "failed"

	aiImageTaskTTL          = 6 * time.Hour
	aiImageTaskPollInterval = 2 * time.Second
	aiImageTaskMaxWait      = 2 * time.Hour
)

type aiImageTask struct {
	ID              string          `json:"id"`
	Status          string          `json:"status"`
	Endpoint        string          `json:"endpoint"`
	Model           string          `json:"model"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
	CompletedAt     *time.Time      `json:"completedAt,omitempty"`
	StatusCode      int             `json:"statusCode,omitempty"`
	Result          json.RawMessage `json:"result,omitempty"`
	Error           string          `json:"error,omitempty"`
	UpstreamTaskID  string          `json:"upstreamTaskId,omitempty"`
	UpstreamTaskURL string          `json:"upstreamTaskUrl,omitempty"`
	UserID          string          `json:"-"`
}

type aiImageTaskStore struct {
	mu    sync.RWMutex
	tasks map[string]*aiImageTask
}

var imageTasks = &aiImageTaskStore{tasks: map[string]*aiImageTask{}}

func AIImageGenerationTask(w http.ResponseWriter, r *http.Request) {
	submitAIImageTask(w, r, "/images/generations")
}

func AIImageEditTask(w http.ResponseWriter, r *http.Request) {
	submitAIImageTask(w, r, "/images/edits")
}

func AIImageTask(w http.ResponseWriter, r *http.Request, id string) {
	task, ok := imageTasks.get(id)
	if !ok {
		FailWithStatus(w, http.StatusNotFound, "任务不存在或已过期")
		return
	}
	if !canAccessAIImageTask(r, task) {
		FailWithStatus(w, http.StatusForbidden, "无权访问该任务")
		return
	}
	OK(w, task.snapshot())
}

func AIImageTaskEvents(w http.ResponseWriter, r *http.Request, id string) {
	task, ok := imageTasks.get(id)
	if !ok {
		FailWithStatus(w, http.StatusNotFound, "任务不存在或已过期")
		return
	}
	if !canAccessAIImageTask(r, task) {
		FailWithStatus(w, http.StatusForbidden, "无权访问该任务")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		FailWithStatus(w, http.StatusInternalServerError, "当前服务不支持事件流")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Connection", "keep-alive")

	writeAIImageTaskEvent := func(event string, value any) bool {
		body, _ := json.Marshal(value)
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, body); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}

	lastStatus := ""
	for {
		current, exists := imageTasks.get(id)
		if !exists {
			_ = writeAIImageTaskEvent("failed", map[string]any{"id": id, "status": aiImageTaskStatusFailed, "error": "任务不存在或已过期"})
			return
		}
		snapshot := current.snapshot()
		if current.Status != lastStatus {
			if !writeAIImageTaskEvent(current.Status, snapshot) {
				return
			}
			lastStatus = current.Status
		} else if !writeAIImageTaskEvent("ping", map[string]any{"id": id, "status": current.Status, "updatedAt": current.UpdatedAt}) {
			return
		}
		if isTerminalAIImageTaskStatus(current.Status) {
			return
		}
		select {
		case <-r.Context().Done():
			return
		case <-time.After(aiImageTaskPollInterval):
		}
	}
}

func submitAIImageTask(w http.ResponseWriter, r *http.Request, path string) {
	startedAt := time.Now()
	endpoint := path
	body, contentType, modelName, err := readAIRequest(r)
	requestBodyForLog := aiRequestLogBody(body, contentType)
	if err != nil {
		log.Printf("AI image task request read failed: %v", err)
		Fail(w, "AI interface request failed")
		return
	}
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "Not logged in or permission denied")
		return
	}

	channel, credits, onFailure, logContext, err := prepareAIImageTaskProxy(r, user, endpoint, modelName, body, contentType, requestBodyForLog, startedAt)
	if err != nil {
		if safe, ok := err.(interface{ SafeMessage() string }); ok {
			Fail(w, safe.SafeMessage())
		} else {
			Fail(w, "AI interface request failed")
		}
		return
	}
	if credits > 0 {
		pathForCost := resolveAIProxyPath(channel.BaseURL, modelName, path)
		if err := service.ConsumeUserCredits(user.ID, modelName, credits, pathForCost); err != nil {
			FailError(w, err)
			return
		}
	}

	resolvedPath := resolveAIProxyPath(channel.BaseURL, modelName, path)
	upstreamURL := service.BuildModelChannelURL(channel, resolvedPath)
	request, err := http.NewRequestWithContext(context.Background(), http.MethodPost, upstreamURL, bytes.NewReader(body))
	if err != nil {
		if onFailure != nil {
			onFailure()
		}
		saveAIProxyLog(&logContext, 0, "", err.Error())
		Fail(w, "AI interface request failed")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}

	task := &aiImageTask{
		ID:        uuid.NewString(),
		Status:    aiImageTaskStatusQueued,
		Endpoint:  endpoint,
		Model:     strings.TrimSpace(modelName),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		UserID:    user.ID,
	}
	imageTasks.put(task)

	go runAIImageTask(task.ID, request, onFailure, &logContext)
	OK(w, task.snapshot())
}

func prepareAIImageTaskProxy(r *http.Request, user model.AuthUser, endpoint string, modelName string, body []byte, contentType string, requestBodyForLog string, startedAt time.Time) (model.ModelChannel, int, func(), aiProxyLogContext, error) {
	if channel, ok, err := fixedUserChannelFromRequest(r, modelName); ok || err != nil {
		if err != nil {
			return model.ModelChannel{}, 0, nil, aiProxyLogContext{}, err
		}
		logContext := aiProxyLogContextFor(user, endpoint, http.MethodPost, modelName, channel, 0, requestBodyForLog, startedAt, true)
		return channel, 0, nil, logContext, nil
	}

	credits, err := service.ModelCost(modelName)
	if err != nil {
		log.Printf("AI image task read model cost failed: model=%s err=%v", modelName, err)
		return model.ModelChannel{}, 0, nil, aiProxyLogContext{}, err
	}
	credits *= readAIRequestCount(body, contentType)
	channel, err := service.SelectModelChannel(modelName)
	if err != nil {
		log.Printf("AI image task select channel failed: model=%s err=%v", modelName, err)
		return model.ModelChannel{}, 0, nil, aiProxyLogContext{}, err
	}
	logContext := aiProxyLogContextFor(user, endpoint, http.MethodPost, modelName, channel, credits, requestBodyForLog, startedAt, true)
	onFailure := func() {
		if err := service.RefundUserCredits(user.ID, modelName, credits, resolveAIProxyPath(channel.BaseURL, modelName, endpoint)); err != nil {
			log.Printf("AI image task refund credits failed: user=%s model=%s credits=%d err=%v", user.ID, modelName, credits, err)
		}
	}
	return channel, credits, onFailure, logContext, nil
}

func runAIImageTask(id string, request *http.Request, onFailure func(), logContext *aiProxyLogContext) {
	imageTasks.update(id, func(task *aiImageTask) {
		task.Status = aiImageTaskStatusRunning
		task.UpdatedAt = time.Now()
	})
	status, body, upstreamTaskID, upstreamTaskURL, err := executeAIImageTaskRequest(request)
	if err != nil {
		if onFailure != nil {
			onFailure()
		}
		saveAIProxyLog(logContext, status, aiProxyLogBodyText(body, aiProxyLogBodyLimit), err.Error())
		imageTasks.finish(id, aiImageTaskStatusFailed, status, nil, err.Error(), upstreamTaskID, upstreamTaskURL)
		return
	}
	saveAIProxyLog(logContext, status, "", "")
	imageTasks.finish(id, aiImageTaskStatusSucceeded, status, json.RawMessage(body), "", upstreamTaskID, upstreamTaskURL)
}

func executeAIImageTaskRequest(request *http.Request) (int, []byte, string, string, error) {
	if status, body, taskID, taskURL, ok, err := executeAIImageViaUpstreamTask(request); ok || err != nil {
		return status, body, taskID, taskURL, err
	}
	return executeBufferedAIImageRequestWithRetry(request)
}

func executeBufferedAIImageRequestWithRetry(request *http.Request) (int, []byte, string, string, error) {
	const maxAttempts = 3
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		response, body, err := doBufferedAIProxyRequest(request)
		if err != nil {
			log.Printf("AI image task request failed: url=%s attempt=%d err=%v", request.URL.String(), attempt, err)
			if attempt < maxAttempts && sleepAIImageProxyRetry(request, attempt) {
				continue
			}
			return 0, nil, "", "", err
		}
		if response.StatusCode >= http.StatusBadRequest {
			errorText := aiUpstreamStatusMessage(response.StatusCode, body)
			if shouldRetryAIImageUpstreamStatus(response.StatusCode, attempt) && sleepAIImageProxyRetry(request, attempt) {
				log.Printf("AI image task upstream retry: url=%s status=%d attempt=%d error=%s", request.URL.String(), response.StatusCode, attempt, errorText)
				continue
			}
			return response.StatusCode, body, "", "", errors.New(errorText)
		}
		if errorText := validateAIImageProxyPayload(body); errorText != "" {
			if shouldRetryAIImageEmptyPayload(attempt) && sleepAIImageProxyRetry(request, attempt) {
				log.Printf("AI image task empty payload retry: url=%s status=%d attempt=%d error=%s", request.URL.String(), response.StatusCode, attempt, errorText)
				continue
			}
			return http.StatusBadGateway, body, "", "", errors.New(errorText)
		}
		return response.StatusCode, body, "", "", nil
	}
	return 0, nil, "", "", fmt.Errorf("AI interface request failed")
}

func executeAIImageViaUpstreamTask(request *http.Request) (int, []byte, string, string, bool, error) {
	taskURL := upstreamAIImageTaskURL(request)
	if taskURL == "" {
		return 0, nil, "", "", false, nil
	}
	taskRequest, err := cloneAIProxyRequest(request)
	if err != nil {
		return 0, nil, "", "", true, err
	}
	taskRequest = taskRequest.WithContext(context.Background())
	parsedURL := *request.URL
	parsedURL.Path = taskURL
	taskRequest.URL = &parsedURL
	taskRequest.RequestURI = ""
	response, body, err := doSingleBufferedRequest(taskRequest)
	if err != nil {
		return 0, nil, "", "", true, err
	}
	if response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusMethodNotAllowed {
		return 0, nil, "", "", false, nil
	}
	if response.StatusCode >= http.StatusBadRequest {
		return response.StatusCode, body, "", "", true, errors.New(aiUpstreamStatusMessage(response.StatusCode, body))
	}
	statusURL, taskID, err := parseUpstreamAIImageTaskSubmit(request.URL, body)
	if err != nil {
		return response.StatusCode, body, "", "", true, err
	}
	resultStatus, resultBody, err := pollUpstreamAIImageTask(taskRequest, statusURL)
	return resultStatus, resultBody, taskID, statusURL, true, err
}

func upstreamAIImageTaskURL(request *http.Request) string {
	if request == nil || request.URL == nil {
		return ""
	}
	path := request.URL.Path
	switch {
	case strings.HasSuffix(path, "/images/generations"):
		return strings.TrimSuffix(path, "/images/generations") + "/images/tasks/generations"
	case strings.HasSuffix(path, "/images/edits"):
		return strings.TrimSuffix(path, "/images/edits") + "/images/tasks/edits"
	default:
		return ""
	}
}

func doSingleBufferedRequest(request *http.Request) (*http.Response, []byte, error) {
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, nil, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	return response, body, err
}

type upstreamImageTaskSubmitResponse struct {
	ID        string `json:"id"`
	TaskID    string `json:"taskId"`
	StatusURL string `json:"status_url"`
	StatusUrl string `json:"statusUrl"`
	Data      struct {
		ID        string `json:"id"`
		TaskID    string `json:"taskId"`
		StatusURL string `json:"status_url"`
		StatusUrl string `json:"statusUrl"`
	} `json:"data"`
}

func parseUpstreamAIImageTaskSubmit(base *url.URL, body []byte) (string, string, error) {
	var payload upstreamImageTaskSubmitResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return "", "", err
	}
	taskID := firstNonEmpty(payload.ID, payload.TaskID, payload.Data.ID, payload.Data.TaskID)
	statusURL := firstNonEmpty(payload.StatusURL, payload.StatusUrl, payload.Data.StatusURL, payload.Data.StatusUrl)
	if taskID == "" && statusURL == "" {
		return "", "", fmt.Errorf("missing upstream image task id")
	}
	if statusURL != "" && base != nil {
		if parsed, err := url.Parse(statusURL); err == nil && parsed.Scheme == "" && parsed.Host == "" {
			clone := *base
			clone.Path = parsed.Path
			clone.RawQuery = parsed.RawQuery
			clone.Fragment = ""
			statusURL = clone.String()
		}
	}
	if statusURL == "" && base != nil {
		clone := *base
		basePath := strings.TrimRight(base.Path, "/")
		switch {
		case strings.HasSuffix(basePath, "/images/tasks/generations"):
			clone.Path = strings.TrimSuffix(basePath, "/generations") + "/" + taskID
		case strings.HasSuffix(basePath, "/images/tasks/edits"):
			clone.Path = strings.TrimSuffix(basePath, "/edits") + "/" + taskID
		case strings.HasSuffix(basePath, "/images/generations"):
			clone.Path = strings.TrimSuffix(basePath, "/images/generations") + "/images/tasks/" + taskID
		case strings.HasSuffix(basePath, "/images/edits"):
			clone.Path = strings.TrimSuffix(basePath, "/images/edits") + "/images/tasks/" + taskID
		default:
			clone.Path = strings.TrimRight(basePath, "/") + "/" + taskID
		}
		clone.RawQuery = ""
		statusURL = clone.String()
	}
	return statusURL, taskID, nil
}

type upstreamImageTaskStatusResponse struct {
	ID         string          `json:"id"`
	TaskID     string          `json:"taskId"`
	Status     string          `json:"status"`
	StatusCode int             `json:"status_code"`
	StatusCode2 int            `json:"statusCode"`
	Response   json.RawMessage `json:"response"`
	Result     json.RawMessage `json:"result"`
	Error      any             `json:"error"`
	Data       struct {
		ID         string          `json:"id"`
		TaskID     string          `json:"taskId"`
		Status     string          `json:"status"`
		StatusCode int             `json:"status_code"`
		StatusCode2 int            `json:"statusCode"`
		Response   json.RawMessage `json:"response"`
		Result     json.RawMessage `json:"result"`
		Error      any             `json:"error"`
	} `json:"data"`
}

func pollUpstreamAIImageTask(template *http.Request, statusURL string) (int, []byte, error) {
	deadline := time.After(aiImageTaskMaxWait)
	ticker := time.NewTicker(aiImageTaskPollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-deadline:
			return 0, nil, fmt.Errorf("AI 上游任务等待超时")
		case <-ticker.C:
		}
		pollRequest, err := http.NewRequestWithContext(context.Background(), http.MethodGet, statusURL, nil)
		if err != nil {
			return 0, nil, err
		}
		if template != nil {
			if auth := template.Header.Get("Authorization"); auth != "" {
				pollRequest.Header.Set("Authorization", auth)
			}
		}
		response, body, err := doSingleBufferedRequest(pollRequest)
		if err != nil {
			return 0, nil, err
		}
		if response.StatusCode >= http.StatusBadRequest {
			return response.StatusCode, body, errors.New(aiUpstreamStatusMessage(response.StatusCode, body))
		}
		var payload upstreamImageTaskStatusResponse
		if err := json.Unmarshal(body, &payload); err != nil {
			return response.StatusCode, body, err
		}
		status := firstNonEmpty(payload.Status, payload.Data.Status)
		switch status {
		case aiImageTaskStatusSucceeded, "success", "completed", "done":
			result := payload.Response
			if len(bytes.TrimSpace(result)) == 0 {
				result = payload.Result
			}
			if len(bytes.TrimSpace(result)) == 0 {
				result = payload.Data.Response
			}
			if len(bytes.TrimSpace(result)) == 0 {
				result = payload.Data.Result
			}
			if len(bytes.TrimSpace(result)) == 0 {
				return response.StatusCode, body, fmt.Errorf("AI 上游任务未返回结果")
			}
			statusCode := firstPositive(payload.StatusCode, payload.StatusCode2, payload.Data.StatusCode, payload.Data.StatusCode2, http.StatusOK)
			if statusCode >= http.StatusBadRequest {
				return statusCode, result, errors.New(aiUpstreamStatusMessage(statusCode, result))
			}
			if errorText := validateAIImageProxyPayload(result); errorText != "" {
				return http.StatusBadGateway, result, errors.New(errorText)
			}
			return statusCode, result, nil
		case aiImageTaskStatusFailed, "error", "cancelled", "canceled":
			return response.StatusCode, body, errors.New(upstreamAIImageTaskError(payload.Error, payload.Data.Error))
		default:
			continue
		}
	}
}

func upstreamAIImageTaskError(values ...any) string {
	for _, value := range values {
		switch v := value.(type) {
		case string:
			if strings.TrimSpace(v) != "" {
				return safeUpstreamText(v)
			}
		case map[string]any:
			for _, key := range []string{"message", "msg", "error"} {
				if text, ok := v[key].(string); ok && strings.TrimSpace(text) != "" {
					return safeUpstreamText(text)
				}
			}
		}
	}
	return "AI 上游任务失败"
}

func firstPositive(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func canAccessAIImageTask(r *http.Request, task *aiImageTask) bool {
	if task == nil {
		return false
	}
	user, ok := service.UserFromContext(r.Context())
	return ok && user.ID != "" && user.ID == task.UserID
}

func isTerminalAIImageTaskStatus(status string) bool {
	return status == aiImageTaskStatusSucceeded || status == aiImageTaskStatusFailed
}

func (store *aiImageTaskStore) put(task *aiImageTask) {
	store.cleanup()
	store.mu.Lock()
	defer store.mu.Unlock()
	store.tasks[task.ID] = task
}

func (store *aiImageTaskStore) get(id string) (*aiImageTask, bool) {
	store.cleanup()
	store.mu.RLock()
	defer store.mu.RUnlock()
	task, ok := store.tasks[strings.TrimSpace(id)]
	if !ok {
		return nil, false
	}
	return task.snapshot(), true
}

func (store *aiImageTaskStore) update(id string, fn func(*aiImageTask)) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if task, ok := store.tasks[id]; ok && fn != nil {
		fn(task)
		task.UpdatedAt = time.Now()
	}
}

func (store *aiImageTaskStore) finish(id string, status string, statusCode int, result json.RawMessage, errorText string, upstreamTaskID string, upstreamTaskURL string) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if task, ok := store.tasks[id]; ok {
		now := time.Now()
		task.Status = status
		task.StatusCode = statusCode
		task.Result = result
		task.Error = errorText
		task.UpstreamTaskID = upstreamTaskID
		task.UpstreamTaskURL = upstreamTaskURL
		task.UpdatedAt = now
		task.CompletedAt = &now
	}
}

func (store *aiImageTaskStore) cleanup() {
	store.mu.Lock()
	defer store.mu.Unlock()
	cutoff := time.Now().Add(-aiImageTaskTTL)
	for id, task := range store.tasks {
		if task == nil || task.CreatedAt.Before(cutoff) {
			delete(store.tasks, id)
		}
	}
}

func (task *aiImageTask) snapshot() *aiImageTask {
	if task == nil {
		return nil
	}
	clone := *task
	if task.Result != nil {
		clone.Result = append(json.RawMessage(nil), task.Result...)
	}
	return &clone
}
