package service

import (
	"os"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

const UserAPIKeyHeader = "X-Shengtu-User-Api-Key"

const FixedUserModelPublicBaseURL = "https://kongsubapi.959298.xyz"
const Sub2APIInternalBaseURLEnv = "SHENGTU_SUB2API_INTERNAL_BASE_URL"
const FixedUserModelBaseURLEnv = "SHENGTU_USER_KEY_BASE_URL"

// FixedUserModelChannel builds the only upstream channel allowed for user-supplied keys.
// The client may provide its own API key, but it cannot choose or override BaseURL.
// SHENGTU_USER_KEY_BASE_URL is server-only and lets the deployment bypass public Cloudflare
// for the fixed upstream, e.g. http://172.18.0.1:28081 on the same VPS.
func FixedUserModelChannel(apiKey string, modelName string) (model.ModelChannel, error) {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return model.ModelChannel{}, safeMessageError{message: "Please enter API Key"}
	}
	return normalizeModelChannel(model.ModelChannel{
		ID:      "fixed-user-key",
		Name:    "User API Key",
		BaseURL: fixedUserModelBaseURL(),
		APIKey:  apiKey,
		Models:  []string{strings.TrimSpace(modelName)},
		Weight:  1,
		Enabled: true,
	}), nil
}

func fixedUserModelBaseURL() string {
	if baseURL := strings.TrimSpace(os.Getenv(FixedUserModelBaseURLEnv)); baseURL != "" {
		return baseURL
	}
	if baseURL := strings.TrimSpace(os.Getenv(Sub2APIInternalBaseURLEnv)); baseURL != "" {
		return baseURL
	}
	return FixedUserModelPublicBaseURL
}
