package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/jackc/pgx/v5"
)

// Sub2APIAuthUser contains only the sub2api user fields required for password-login fallback.
type Sub2APIAuthUser struct {
	ID           int64
	Email        string
	Username     string
	PasswordHash string
	Role         string
	Status       string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// GetSub2APIAuthUser finds an active sub2api account candidate by email or username.
// The caller is responsible for bcrypt password verification and status handling.
func GetSub2APIAuthUser(login string) (Sub2APIAuthUser, bool, error) {
	login = strings.TrimSpace(login)
	dsn := strings.TrimSpace(config.Cfg.Sub2APIAuthDSN)
	if login == "" || dsn == "" {
		return Sub2APIAuthUser{}, false, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return Sub2APIAuthUser{}, false, err
	}
	defer conn.Close(ctx)

	const query = `
SELECT id, email, username, password_hash, role, status, created_at, updated_at
FROM users
WHERE deleted_at IS NULL
  AND (lower(email) = lower($1) OR lower(username) = lower($1))
ORDER BY CASE WHEN lower(email) = lower($1) THEN 0 ELSE 1 END, id ASC
LIMIT 1`

	var user Sub2APIAuthUser
	err = conn.QueryRow(ctx, query, login).Scan(
		&user.ID,
		&user.Email,
		&user.Username,
		&user.PasswordHash,
		&user.Role,
		&user.Status,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Sub2APIAuthUser{}, false, nil
	}
	if err != nil {
		return Sub2APIAuthUser{}, false, err
	}
	return user, true, nil
}
