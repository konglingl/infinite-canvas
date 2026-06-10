package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

const aiProxyLogBodyLimit = 256 * 1024

type aiProxyLogContext struct {
	Enabled         bool
	StartedAt       time.Time
	UserID          string
	UserDisplayName string
	Endpoint        string
	Method          string
	Model           string
	ChannelID       string
	ChannelName     string
	Credits         int
	RequestBody     string
}

func AIImagesGenerations(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/images/generations")
}

func AIImagesEdits(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/images/edits")
}

func AIChatCompletions(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/chat/completions")
}

func AIAudioSpeech(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/audio/speech")
}

func AIVideos(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/videos")
}

func AIVideo(w http.ResponseWriter, r *http.Request, id string) {
	proxyAIGetRequest(w, r, "/videos/"+id)
}

func AIVideoContent(w http.ResponseWriter, r *http.Request, id string) {
	proxyAIGetRequest(w, r, "/videos/"+id+"/content")
}

func AIModels(w http.ResponseWriter, r *http.Request) {
	user, _ := service.UserFromContext(r.Context())
	if err := service.EnsureCustomChannelAllowed(user); err != nil {
		FailError(w, err)
		return
	}
	channel, err := service.FixedUserModelChannel(r.Header.Get(service.UserAPIKeyHeader), "")
	if err != nil {
		FailError(w, err)
		return
	}
	request, err := http.NewRequest(http.MethodGet, service.BuildModelChannelURL(channel, "/models"), nil)
	if err != nil {
		Fail(w, "AI interface request failed")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	copyAIResponse(w, request, nil, nil)
}

func proxyAIGetRequest(w http.ResponseWriter, r *http.Request, path string) {
	startedAt := time.Now()
	endpoint := path
	modelName := r.URL.Query().Get("model")
	if strings.TrimSpace(modelName) == "" {
		modelName = "grok-imagine-video"
	}
	if channel, ok, err := fixedUserChannelFromRequest(r, modelName); ok || err != nil {
		if err != nil {
			FailError(w, err)
			return
		}
		user, _ := service.UserFromContext(r.Context())
		logContext := aiProxyLogContextFor(user, endpoint, http.MethodGet, modelName, channel, 0, "", startedAt, true)
		path = resolveAIProxyPath(channel.BaseURL, modelName, path)
		request, err := http.NewRequest(http.MethodGet, service.BuildModelChannelURL(channel, path), nil)
		if err != nil {
			saveAIProxyLog(&logContext, 0, "", err.Error())
			Fail(w, "AI interface request failed")
			return
		}
		request.Header.Set("Authorization", "Bearer "+channel.APIKey)
		copyAIResponse(w, request, nil, &logContext)
		return
	}
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "Not logged in or permission denied")
		return
	}
	channel, err := service.SelectModelChannel(modelName)
	if err != nil {
		log.Printf("AI proxy select channel failed: model=%s err=%v", modelName, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	logContext := aiProxyLogContextFor(user, endpoint, http.MethodGet, modelName, channel, 0, "", startedAt, true)
	path = resolveAIProxyPath(channel.BaseURL, modelName, path)
	request, err := http.NewRequest(http.MethodGet, service.BuildModelChannelURL(channel, path), nil)
	if err != nil {
		saveAIProxyLog(&logContext, 0, "", err.Error())
		Fail(w, "AI 接口请求失败")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	copyAIResponse(w, request, nil, &logContext)
}

func proxyAIRequest(w http.ResponseWriter, r *http.Request, path string) {
	startedAt := time.Now()
	endpoint := path
	body, contentType, modelName, err := readAIRequest(r)
	requestBodyForLog := aiRequestLogBody(body, contentType)
	if err != nil {
		log.Printf("AI proxy request read failed: %v", err)
		Fail(w, "AI interface request failed")
		return
	}
	if channel, ok, err := fixedUserChannelFromRequest(r, modelName); ok || err != nil {
		if err != nil {
			FailError(w, err)
			return
		}
		user, _ := service.UserFromContext(r.Context())
		logContext := aiProxyLogContextFor(user, endpoint, http.MethodPost, modelName, channel, 0, requestBodyForLog, startedAt, true)
		path = resolveAIProxyPath(channel.BaseURL, modelName, path)
		request, err := http.NewRequest(http.MethodPost, service.BuildModelChannelURL(channel, path), bytes.NewReader(body))
		if err != nil {
			log.Printf("AI proxy build user-key request failed: url=%s err=%v", service.BuildModelChannelURL(channel, path), err)
			saveAIProxyLog(&logContext, 0, "", err.Error())
			Fail(w, "AI interface request failed")
			return
		}
		request.Header.Set("Authorization", "Bearer "+channel.APIKey)
		if contentType != "" {
			request.Header.Set("Content-Type", contentType)
		}
		copyAIResponse(w, request, nil, &logContext)
		return
	}
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "Not logged in or permission denied")
		return
	}
	credits, err := service.ModelCost(modelName)
	if err != nil {
		log.Printf("AI proxy read model cost failed: model=%s err=%v", modelName, err)
		Fail(w, "AI interface request failed")
		return
	}
	credits *= readAIRequestCount(body, contentType)
	channel, err := service.SelectModelChannel(modelName)
	if err != nil {
		log.Printf("AI proxy select channel failed: model=%s err=%v", modelName, err)
		Fail(w, "AI interface request failed")
		return
	}
	logContext := aiProxyLogContextFor(user, endpoint, http.MethodPost, modelName, channel, credits, requestBodyForLog, startedAt, true)
	path = resolveAIProxyPath(channel.BaseURL, modelName, path)
	request, err := http.NewRequest(http.MethodPost, service.BuildModelChannelURL(channel, path), bytes.NewReader(body))
	if err != nil {
		log.Printf("AI proxy build request failed: url=%s err=%v", service.BuildModelChannelURL(channel, path), err)
		saveAIProxyLog(&logContext, 0, "", err.Error())
		Fail(w, "AI interface request failed")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	if err := service.ConsumeUserCredits(user.ID, modelName, credits, path); err != nil {
		FailError(w, err)
		return
	}
	copyAIResponse(w, request, func() {
		if err := service.RefundUserCredits(user.ID, modelName, credits, path); err != nil {
			log.Printf("AI proxy refund credits failed: user=%s model=%s credits=%d err=%v", user.ID, modelName, credits, err)
		}
	}, &logContext)
}

func fixedUserChannelFromRequest(r *http.Request, modelName string) (model.ModelChannel, bool, error) {
	apiKey := strings.TrimSpace(r.Header.Get(service.UserAPIKeyHeader))
	if apiKey == "" {
		return model.ModelChannel{}, false, nil
	}
	user, _ := service.UserFromContext(r.Context())
	if err := service.EnsureCustomChannelAllowed(user); err != nil {
		return model.ModelChannel{}, true, err
	}
	channel, err := service.FixedUserModelChannel(apiKey, modelName)
	return channel, true, err
}

func copyAIResponse(w http.ResponseWriter, request *http.Request, onFailure func(), logContext *aiProxyLogContext) {
	if isAIImageProxyRequest(request, logContext) {
		copyAIImageResponseWithRetry(w, request, onFailure, logContext)
		return
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("AI proxy request failed: url=%s err=%v", request.URL.String(), err)
		if onFailure != nil {
			onFailure()
		}
		saveAIProxyLog(logContext, 0, "", err.Error())
		Fail(w, "AI \u63a5\u53e3\u8bf7\u6c42\u5931\u8d25")
		return
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		body, truncated := readLogResponseBody(response.Body, aiProxyLogBodyLimit)
		bodyText := string(body)
		if truncated {
			bodyText += "\n... [truncated]"
		}
		log.Printf("AI upstream error: url=%s status=%d", request.URL.String(), response.StatusCode)
		if onFailure != nil {
			onFailure()
		}
		errorText := aiUpstreamStatusMessage(response.StatusCode, body)
		saveAIProxyLog(logContext, response.StatusCode, bodyText, errorText)
		Fail(w, errorText)
		return
	}

	for key, values := range response.Header {
		if strings.EqualFold(key, "Content-Length") {
			continue
		}
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(response.StatusCode)

	written, copyErr := io.Copy(w, response.Body)
	if copyErr != nil {
		log.Printf("AI proxy copy response failed: url=%s err=%v", request.URL.String(), copyErr)
		saveAIProxyLog(logContext, response.StatusCode, fmt.Sprintf("[response copy failed bytes=%d]", written), copyErr.Error())
		return
	}
	saveAIProxyLog(logContext, response.StatusCode, "", "")
}

func isAIImageProxyRequest(request *http.Request, logContext *aiProxyLogContext) bool {
	endpoint := ""
	if logContext != nil {
		endpoint = logContext.Endpoint
	}
	if isAIImageProxyEndpoint(endpoint) {
		return true
	}
	if request == nil || request.URL == nil {
		return false
	}
	return isAIImageProxyEndpoint(request.URL.Path)
}

func isAIImageProxyEndpoint(value string) bool {
	path := strings.ToLower(strings.TrimSpace(value))
	return strings.HasSuffix(path, "/images/generations") || strings.HasSuffix(path, "/images/edits")
}

func copyAIImageResponseWithRetry(w http.ResponseWriter, request *http.Request, onFailure func(), logContext *aiProxyLogContext) {
	const maxAttempts = 3
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		response, body, err := doBufferedAIProxyRequest(request)
		if err != nil {
			log.Printf("AI image proxy request failed: url=%s attempt=%d err=%v", request.URL.String(), attempt, err)
			if attempt < maxAttempts && sleepAIImageProxyRetry(request, attempt) {
				continue
			}
			if onFailure != nil {
				onFailure()
			}
			saveAIProxyLog(logContext, 0, "", err.Error())
		Fail(w, "AI \u63a5\u53e3\u8bf7\u6c42\u5931\u8d25")
			return
		}

		if response.StatusCode >= http.StatusBadRequest {
			bodyText := aiProxyLogBodyText(body, aiProxyLogBodyLimit)
			errorText := aiUpstreamStatusMessage(response.StatusCode, body)
			if shouldRetryAIImageUpstreamStatus(response.StatusCode, attempt) && sleepAIImageProxyRetry(request, attempt) {
				log.Printf("AI image upstream retry: url=%s status=%d attempt=%d error=%s", request.URL.String(), response.StatusCode, attempt, errorText)
				continue
			}
			log.Printf("AI upstream error: url=%s status=%d", request.URL.String(), response.StatusCode)
			if onFailure != nil {
				onFailure()
			}
			saveAIProxyLog(logContext, response.StatusCode, bodyText, errorText)
			Fail(w, errorText)
			return
		}

		if errorText := validateAIImageProxyPayload(body); errorText != "" {
			bodyText := aiProxyLogBodyText(body, aiProxyLogBodyLimit)
			if shouldRetryAIImageEmptyPayload(attempt) && sleepAIImageProxyRetry(request, attempt) {
				log.Printf("AI image empty payload retry: url=%s status=%d attempt=%d error=%s", request.URL.String(), response.StatusCode, attempt, errorText)
				continue
			}
			log.Printf("AI image empty payload: url=%s status=%d error=%s", request.URL.String(), response.StatusCode, errorText)
			if onFailure != nil {
				onFailure()
			}
			saveAIProxyLog(logContext, http.StatusBadGateway, bodyText, errorText)
			Fail(w, errorText)
			return
		}

		writeBufferedAIProxyResponse(w, response, body)
		saveAIProxyLog(logContext, response.StatusCode, "", "")
		return
	}
}

func doBufferedAIProxyRequest(request *http.Request) (*http.Response, []byte, error) {
	attemptRequest, err := cloneAIProxyRequest(request)
	if err != nil {
		return nil, nil, err
	}
	response, err := http.DefaultClient.Do(attemptRequest)
	if err != nil {
		return nil, nil, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return response, body, err
	}
	return response, body, nil
}

func cloneAIProxyRequest(request *http.Request) (*http.Request, error) {
	if request == nil {
		return nil, fmt.Errorf("AI proxy request is nil")
	}
	cloned := request.Clone(request.Context())
	cloned.Header = request.Header.Clone()
	if request.Body == nil || request.Body == http.NoBody {
		cloned.Body = http.NoBody
		return cloned, nil
	}
	if request.GetBody == nil {
		return nil, fmt.Errorf("AI proxy request body is not replayable")
	}
	body, err := request.GetBody()
	if err != nil {
		return nil, err
	}
	cloned.Body = body
	cloned.GetBody = request.GetBody
	return cloned, nil
}

func shouldRetryAIImageUpstreamStatus(statusCode int, attempt int) bool {
	if attempt >= 3 {
		return false
	}
	switch statusCode {
	case http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return true
	default:
		return false
	}
}

func shouldRetryAIImageEmptyPayload(attempt int) bool {
	return attempt < 2
}

func sleepAIImageProxyRetry(request *http.Request, attempt int) bool {
	delay := 3 * time.Second
	if attempt >= 2 {
		delay = 8 * time.Second
	}
	ctx := request.Context()
	select {
	case <-ctx.Done():
		return false
	case <-time.After(delay):
		return true
	}
}

func writeBufferedAIProxyResponse(w http.ResponseWriter, response *http.Response, body []byte) {
	for key, values := range response.Header {
		if strings.EqualFold(key, "Content-Length") {
			continue
		}
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(response.StatusCode)
	_, _ = w.Write(body)
}

func validateAIImageProxyPayload(body []byte) string {
	if len(bytes.TrimSpace(body)) == 0 {
		return "AI \u63a5\u53e3\u6ca1\u6709\u8fd4\u56de\u56fe\u7247"
	}
	var payload struct {
		Code    *int             `json:"code"`
		Msg     string           `json:"msg"`
		Message string           `json:"message"`
		Error   aiImageErrorBody `json:"error"`
		Data    []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return "AI \u63a5\u53e3\u8fd4\u56de\u683c\u5f0f\u5f02\u5e38\uff0c\u672a\u8fd4\u56de\u56fe\u7247"
	}
	if payload.Code != nil && *payload.Code != 0 {
		if msg := firstNonEmpty(payload.Msg, payload.Message, payload.Error.Message); msg != "" {
			return safeUpstreamText(msg)
		}
		return "AI \u63a5\u53e3\u8bf7\u6c42\u5931\u8d25"
	}
	if payload.Error.Message != "" {
		return safeUpstreamText(payload.Error.Message)
	}
	for _, item := range payload.Data {
		if hasNonEmptyImageField(item, "b64_json") || hasNonEmptyImageField(item, "url") {
			return ""
		}
	}
	return "AI \u63a5\u53e3\u6ca1\u6709\u8fd4\u56de\u56fe\u7247"
}

type aiImageErrorBody struct {
	Code    string `json:"code"`
	Type    string `json:"type"`
	Message string `json:"message"`
}

func hasNonEmptyImageField(item map[string]any, key string) bool {
	value, ok := item[key]
	if !ok {
		return false
	}
	text, ok := value.(string)
	return ok && strings.TrimSpace(text) != ""
}

func aiProxyLogBodyText(body []byte, limit int64) string {
	if limit <= 0 || int64(len(body)) <= limit {
		return string(body)
	}
	return string(body[:limit]) + "\n... [truncated]"
}

func aiProxyLogContextFor(user model.AuthUser, endpoint string, method string, modelName string, channel model.ModelChannel, credits int, requestBody string, startedAt time.Time, enabled bool) aiProxyLogContext {
	return aiProxyLogContext{
		Enabled:         enabled,
		StartedAt:       startedAt,
		UserID:          user.ID,
		UserDisplayName: firstNonEmpty(user.DisplayName, user.Username),
		Endpoint:        endpoint,
		Method:          method,
		Model:           strings.TrimSpace(modelName),
		ChannelID:       strings.TrimSpace(channel.ID),
		ChannelName:     strings.TrimSpace(channel.Name),
		Credits:         credits,
		RequestBody:     requestBody,
	}
}

func saveAIProxyLog(logContext *aiProxyLogContext, status int, responseBody string, errorText string) {
	if logContext == nil || !logContext.Enabled {
		return
	}
	service.SaveAICallLog(service.AICallLogInput{
		UserID:          logContext.UserID,
		UserDisplayName: logContext.UserDisplayName,
		Endpoint:        logContext.Endpoint,
		Method:          logContext.Method,
		Model:           logContext.Model,
		ChannelID:       logContext.ChannelID,
		ChannelName:     logContext.ChannelName,
		Status:          status,
		DurationMs:      time.Since(logContext.StartedAt).Milliseconds(),
		Credits:         logContext.Credits,
		RequestBody:     logContext.RequestBody,
		ResponseBody:    responseBody,
		Error:           errorText,
	})
}

func aiRequestLogBody(body []byte, contentType string) string {
	if !strings.HasPrefix(contentType, "multipart/form-data") {
		return string(body)
	}
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return fmt.Sprintf("[multipart/form-data bytes=%d parse_error=%s]", len(body), err.Error())
	}
	form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
	if err != nil {
		return fmt.Sprintf("[multipart/form-data bytes=%d parse_error=%s]", len(body), err.Error())
	}
	defer form.RemoveAll()
	fields := map[string][]string{}
	for key, values := range form.Value {
		fields[key] = values
	}
	files := []map[string]any{}
	for field, headers := range form.File {
		for _, header := range headers {
			files = append(files, map[string]any{
				"field":       field,
				"filename":    header.Filename,
				"size":        header.Size,
				"contentType": header.Header.Get("Content-Type"),
			})
		}
	}
	payload := map[string]any{
		"contentType": "multipart/form-data",
		"fields":      fields,
		"files":       files,
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Sprintf("[multipart/form-data bytes=%d]", len(body))
	}
	return string(encoded)
}

func shouldCaptureAIResponseBody(contentType string) bool {
	value := strings.ToLower(strings.TrimSpace(contentType))
	return value == "" ||
		strings.HasPrefix(value, "application/json") ||
		strings.HasPrefix(value, "text/") ||
		strings.Contains(value, "event-stream") ||
		strings.Contains(value, "javascript") ||
		strings.Contains(value, "xml")
}

func readLogResponseBody(reader io.Reader, limit int64) ([]byte, bool) {
	limited := io.LimitReader(reader, limit+1)
	body, _ := io.ReadAll(limited)
	if int64(len(body)) <= limit {
		return body, false
	}
	return body[:limit], true
}

type limitedLogBuffer struct {
	Limit     int
	Builder   strings.Builder
	Truncated bool
}

func (buffer *limitedLogBuffer) Write(data []byte) (int, error) {
	if buffer.Limit <= 0 {
		return len(data), nil
	}
	remaining := buffer.Limit - buffer.Builder.Len()
	if remaining <= 0 {
		if len(data) > 0 {
			buffer.Truncated = true
		}
		return len(data), nil
	}
	if len(data) > remaining {
		_, _ = buffer.Builder.Write(data[:remaining])
		buffer.Truncated = true
		return len(data), nil
	}
	_, _ = buffer.Builder.Write(data)
	return len(data), nil
}

func (buffer *limitedLogBuffer) String() string {
	value := buffer.Builder.String()
	if buffer.Truncated {
		value += "\n... [truncated]"
	}
	return value
}

func readAIRequest(r *http.Request) ([]byte, string, string, error) {
	contentType := r.Header.Get("Content-Type")
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, "", "", err
	}
	modelName := ""
	if strings.HasPrefix(contentType, "multipart/form-data") {
		modelName = readMultipartModel(body, contentType)
	} else {
		var payload struct {
			Model string `json:"model"`
		}
		_ = json.Unmarshal(body, &payload)
		modelName = payload.Model
	}
	if strings.TrimSpace(modelName) == "" {
		return nil, "", "", errMissingModel
	}
	return body, contentType, modelName, nil
}

func readMultipartModel(body []byte, contentType string) string {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return ""
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	form, err := reader.ReadForm(32 << 20)
	if err != nil {
		return ""
	}
	defer form.RemoveAll()
	if values := form.Value["model"]; len(values) > 0 {
		return values[0]
	}
	return ""
}

func readAIRequestCount(body []byte, contentType string) int {
	count := 1
	if strings.HasPrefix(contentType, "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			return count
		}
		form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
		if err != nil {
			return count
		}
		defer form.RemoveAll()
		if values := form.Value["n"]; len(values) > 0 {
			_, _ = fmt.Sscan(values[0], &count)
		}
	} else {
		var payload struct {
			N int `json:"n"`
		}
		_ = json.Unmarshal(body, &payload)
		count = payload.N
	}
	if count < 1 {
		return 1
	}
	return count
}

var errMissingModel = &aiError{"缺少模型名称"}

func resolveAIProxyPath(baseURL string, modelName string, path string) string {
	if !isArkSeedanceVideo(baseURL, modelName) {
		return path
	}
	if path == "/videos" {
		return "/contents/generations/tasks"
	}
	if strings.HasPrefix(path, "/videos/") && !strings.HasSuffix(path, "/content") {
		return "/contents/generations/tasks/" + strings.TrimPrefix(path, "/videos/")
	}
	return path
}

func isArkSeedanceVideo(baseURL string, modelName string) bool {
	base := strings.ToLower(baseURL)
	model := strings.ToLower(modelName)
	return strings.Contains(model, "seedance") || strings.Contains(model, "doubao-seedance") || strings.Contains(base, "/api/plan/v3")
}

func aiStatusMessage(statusCode int) string {
	switch statusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		return "AI 接口鉴权失败，请检查 API Key、套餐权限或模型权限"
	case http.StatusTooManyRequests:
		return "AI 接口限流或额度不足，请稍后重试或检查额度"
	default:
		return "AI 接口请求失败"
	}
}

func aiUpstreamStatusMessage(statusCode int, body []byte) string {
	base := aiStatusMessage(statusCode)
	detail := aiUpstreamErrorDetail(body)
	if detail == "" {
		return base
	}
	return base + "：" + detail
}

func aiUpstreamErrorDetail(body []byte) string {
	text := strings.TrimSpace(string(body))
	if text == "" {
		return ""
	}
	var payload struct {
		Msg     string `json:"msg"`
		Message string `json:"message"`
		Error   struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &payload); err == nil {
		if payload.Error.Message != "" {
			if detail := friendlyUpstreamError(payload.Error.Code, payload.Error.Message); detail != "" {
				return safeUpstreamText(detail)
			}
			if payload.Error.Code != "" {
				return safeUpstreamText(payload.Error.Code + " " + payload.Error.Message)
			}
			return safeUpstreamText(payload.Error.Message)
		}
		if payload.Msg != "" {
			return safeUpstreamText(payload.Msg)
		}
		if payload.Message != "" {
			return safeUpstreamText(payload.Message)
		}
	}
	return safeUpstreamText(text)
}

func friendlyUpstreamError(code string, message string) string {
	lowerCode := strings.ToLower(strings.TrimSpace(code))
	if strings.Contains(lowerCode, "inputvideosensitivecontentdetected") || strings.Contains(lowerCode, "privacyinformation") {
		return strings.TrimSpace(code + " 参考视频疑似包含真人或隐私信息，火山方舟拒绝使用普通 URL 作为真人视频参考；请改用不含真人的视频、官方允许的模型产物，或已授权的 asset:// 素材。原始错误：" + message)
	}
	return ""
}

func safeUpstreamText(text string) string {
	text = strings.Join(strings.Fields(strings.TrimSpace(text)), " ")
	runes := []rune(text)
	if len(runes) > 300 {
		return string(runes[:300]) + "..."
	}
	return text
}

type aiError struct {
	message string
}

func (err *aiError) Error() string {
	return err.message
}
