package model

// RedeemCode 算力点兑换码。
type RedeemCode struct {
	ID         string `json:"id" gorm:"primaryKey"`
	Code       string `json:"code" gorm:"uniqueIndex"`
	Credits    int    `json:"credits"`
	TotalLimit int    `json:"totalLimit"`
	UsedCount  int    `json:"usedCount"`
	Enabled    bool   `json:"enabled"`
	ExpiresAt  string `json:"expiresAt"`
	Remark     string `json:"remark"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

type RedeemCodeList struct {
	Items []RedeemCode `json:"items"`
	Total int          `json:"total"`
}

// RedeemCodeUse 兑换码使用记录。同一个用户对同一个兑换码只能兑换一次。
type RedeemCodeUse struct {
	ID              string `json:"id" gorm:"primaryKey"`
	CodeID          string `json:"codeId" gorm:"index;uniqueIndex:idx_redeem_code_user"`
	Code            string `json:"code" gorm:"index"`
	UserID          string `json:"userId" gorm:"index;uniqueIndex:idx_redeem_code_user"`
	UserDisplayName string `json:"userDisplayName" gorm:"->;-:migration"`
	Credits         int    `json:"credits"`
	CreatedAt       string `json:"createdAt"`
}

type RedeemCodeResult struct {
	Code    string   `json:"code"`
	Credits int      `json:"credits"`
	Balance int      `json:"balance"`
	User    AuthUser `json:"user"`
}
