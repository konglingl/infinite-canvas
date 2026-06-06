package service

import (
	"crypto/sha1"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func DefaultSystemPrompts() model.SystemPromptSetting {
	return model.SystemPromptSetting{
		Image:    "",
		Video:    "",
		Text:     "",
		Workflow: "",
		WorkflowAgent: `?????????????????????????????????? JSON????? Markdown?????????????????????????????????? snake_case?label ?????promptTemplate ?? {{variable_name}} ?????`,
	}
}

func normalizePrivateStorageSetting(setting model.PrivateStorageSetting) model.PrivateStorageSetting {
	if setting.Mode == "" {
		setting.Mode = "local_indexeddb"
	}
	if setting.CapacityLimitBytes <= 0 {
		setting.CapacityLimitBytes = defaultStorageCapacityLimitBytes
	}
	setting.CapacityCheck = normalizeStorageCapacityCheckSetting(setting.CapacityCheck)
	if setting.Providers == nil {
		setting.Providers = []model.StorageProvider{}
	}
	for i := range setting.Providers {
		setting.Providers[i] = normalizeStorageProvider(setting.Providers[i])
	}
	return setting
}

func normalizeStorageCapacityCheckSetting(setting model.StorageCapacityCheckSetting) model.StorageCapacityCheckSetting {
	if setting.Cron == "" {
		setting.Cron = "0 */6 * * *"
	}
	if setting.Enabled == nil {
		enabled := false
		setting.Enabled = &enabled
	}
	return setting
}

func normalizeStorageProvider(provider model.StorageProvider) model.StorageProvider {
	provider.Name = strings.TrimSpace(provider.Name)
	provider.Endpoint = strings.TrimRight(strings.TrimSpace(provider.Endpoint), "/")
	provider.Bucket = strings.TrimSpace(provider.Bucket)
	provider.AccessKeyID = strings.TrimSpace(provider.AccessKeyID)
	if provider.Type == "" {
		provider.Type = "s3"
	}
	if provider.Region == "" {
		provider.Region = "auto"
	}
	if provider.ID == "" {
		provider.ID = stableStorageProviderID(provider)
	}
	if provider.Weight <= 0 {
		provider.Weight = 1
	}
	return provider
}

func stableStorageProviderID(provider model.StorageProvider) string {
	h := sha1.Sum([]byte(strings.Join([]string{provider.Name, provider.Type, provider.Endpoint, provider.Region, provider.Bucket, provider.PublicBaseURL, provider.PathPrefix, provider.OwnerUserID}, "|")))
	return "storage_" + hex.EncodeToString(h[:8])
}

func HTTPClientForChannel(channel model.ModelChannel) *http.Client {
	timeout := channel.Timeout
	if timeout <= 0 {
		timeout = 600
	}
	return &http.Client{Timeout: time.Duration(timeout) * time.Second}
}

func SelectModelChannelForModel(modelName string, channelID string) (model.ModelChannel, error) {
	channelID = strings.TrimSpace(channelID)
	if channelID == "" {
		return SelectModelChannel(modelName)
	}
	settings, err := repository.GetSettings()
	if err != nil {
		return model.ModelChannel{}, err
	}
	for _, channel := range normalizePrivateSetting(settings.Private).Channels {
		if !channel.Enabled || channel.ID != channelID {
			continue
		}
		if strings.TrimSpace(modelName) == "" {
			return channel, nil
		}
		for _, item := range channel.Models {
			if strings.TrimSpace(item) == modelName {
				return channel, nil
			}
		}
	}
	return SelectModelChannel(modelName)
}
