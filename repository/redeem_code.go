package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

var (
	ErrRedeemCodeNotFound       = errors.New("redeem code not found")
	ErrRedeemCodeDisabled       = errors.New("redeem code disabled")
	ErrRedeemCodeExhausted      = errors.New("redeem code exhausted")
	ErrRedeemCodeAlreadyUsed    = errors.New("redeem code already used")
	ErrRedeemCodeInvalidCredits = errors.New("redeem code invalid credits")
	ErrRedeemCodeUserNotFound   = errors.New("redeem code user not found")
)

func ListRedeemCodes(q model.Query) ([]model.RedeemCode, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.RedeemCode{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("code LIKE ? OR remark LIKE ?", like, like)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var codes []model.RedeemCode
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&codes).Error
	return codes, total, err
}

func GetRedeemCodeByID(id string) (model.RedeemCode, bool, error) {
	db, err := DB()
	if err != nil {
		return model.RedeemCode{}, false, err
	}
	var code model.RedeemCode
	err = db.Where("id = ?", id).First(&code).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.RedeemCode{}, false, nil
	}
	return code, err == nil, err
}

func GetRedeemCodeByCode(codeText string) (model.RedeemCode, bool, error) {
	db, err := DB()
	if err != nil {
		return model.RedeemCode{}, false, err
	}
	var code model.RedeemCode
	err = db.Where("code = ?", codeText).First(&code).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.RedeemCode{}, false, nil
	}
	return code, err == nil, err
}

func SaveRedeemCode(code model.RedeemCode) (model.RedeemCode, error) {
	db, err := DB()
	if err != nil {
		return code, err
	}
	return code, db.Save(&code).Error
}

func DeleteRedeemCode(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.RedeemCode{}, "id = ?", id).Error
}

func UseRedeemCode(userID string, codeText string, nowText string, usageID string) (model.User, model.RedeemCode, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, model.RedeemCode{}, err
	}
	var user model.User
	var code model.RedeemCode
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("code = ?", codeText).First(&code).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrRedeemCodeNotFound
			}
			return err
		}
		if !code.Enabled {
			return ErrRedeemCodeDisabled
		}
		if code.Credits <= 0 {
			return ErrRedeemCodeInvalidCredits
		}
		if code.TotalLimit > 0 && code.UsedCount >= code.TotalLimit {
			return ErrRedeemCodeExhausted
		}
		var used int64
		if err := tx.Model(&model.RedeemCodeUse{}).Where("code_id = ? AND user_id = ?", code.ID, userID).Count(&used).Error; err != nil {
			return err
		}
		if used > 0 {
			return ErrRedeemCodeAlreadyUsed
		}

		update := tx.Model(&model.RedeemCode{}).
			Where("id = ? AND enabled = ? AND (total_limit <= 0 OR used_count < total_limit)", code.ID, true).
			Updates(map[string]any{
				"used_count": gorm.Expr("used_count + 1"),
				"updated_at": nowText,
			})
		if update.Error != nil {
			return update.Error
		}
		if update.RowsAffected == 0 {
			return ErrRedeemCodeExhausted
		}

		usage := model.RedeemCodeUse{
			ID:        usageID,
			CodeID:    code.ID,
			Code:      code.Code,
			UserID:    userID,
			Credits:   code.Credits,
			CreatedAt: nowText,
		}
		if err := tx.Create(&usage).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrRedeemCodeAlreadyUsed
			}
			return err
		}

		userUpdate := tx.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]any{
			"credits":    gorm.Expr("credits + ?", code.Credits),
			"updated_at": nowText,
		})
		if userUpdate.Error != nil {
			return userUpdate.Error
		}
		if userUpdate.RowsAffected == 0 {
			return ErrRedeemCodeUserNotFound
		}
		if err := tx.Where("id = ?", userID).First(&user).Error; err != nil {
			return err
		}
		code.UsedCount++
		code.UpdatedAt = nowText
		return nil
	})
	return user, code, err
}

func isUniqueConstraintError(err error) bool {
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "unique") || strings.Contains(text, "duplicate")
}
