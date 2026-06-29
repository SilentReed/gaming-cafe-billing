"""
商户功能管理 API（超管专用）
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from pydantic import BaseModel

from ..database import get_db
from ..models.merchant import Merchant
from ..deps import require_admin

router = APIRouter(prefix="/merchants", tags=["商户管理"])


# 可用功能列表
AVAILABLE_FEATURES = [
    {"id": "dashboard", "name": "收银台/计费大厅", "description": "主机计费、上机管理", "required": True},
    {"id": "members", "name": "会员管理", "description": "会员账户、充值、积分"},
    {"id": "bills", "name": "账单记录", "description": "消费记录、结账"},
    {"id": "packages", "name": "时段套餐", "description": "套餐购买、使用"},
    {"id": "products", "name": "餐饮商品", "description": "商品销售"},
    {"id": "orders", "name": "订单管理", "description": "餐饮订单处理"},
    {"id": "shifts", "name": "交班管理", "description": "班次交接、营业额"},
    {"id": "staff", "name": "员工管理", "description": "员工账户、权限"},
    {"id": "reports", "name": "报表统计", "description": "经营报表、分析"},
    {"id": "reservations", "name": "预约管理", "description": "主机预约"},
    {"id": "console-settings", "name": "主机设置", "description": "主机配置、费率"},
]


class MerchantFeaturesUpdate(BaseModel):
    enabled_features: List[str]


class MerchantToggleFeature(BaseModel):
    feature_id: str
    enabled: bool


@router.get("/features/available")
def list_available_features(current_user=Depends(require_admin)):
    """获取所有可用功能列表"""
    return AVAILABLE_FEATURES


@router.get("/{merchant_id}/features")
def get_merchant_features(merchant_id: int, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    """获取商户已启用的功能"""
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="商户不存在")
    
    enabled = merchant.enabled_features or []
    return {
        "merchant_id": merchant_id,
        "merchant_name": merchant.name,
        "enabled_features": enabled,
        "available_features": AVAILABLE_FEATURES
    }


@router.put("/{merchant_id}/features")
def update_merchant_features(merchant_id: int, data: MerchantFeaturesUpdate, 
                            current_user=Depends(require_admin), db: Session = Depends(get_db)):
    """更新商户功能配置"""
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="商户不存在")
    
    # 验证功能ID有效性
    valid_ids = {f["id"] for f in AVAILABLE_FEATURES}
    invalid = set(data.enabled_features) - valid_ids
    if invalid:
        raise HTTPException(status_code=400, detail=f"无效的功能ID: {invalid}")
    
    # 必须保留dashboard
    if "dashboard" not in data.enabled_features:
        data.enabled_features.insert(0, "dashboard")
    
    merchant.enabled_features = data.enabled_features
    db.commit()
    
    return {"message": "功能配置已更新", "enabled_features": data.enabled_features}


@router.post("/{merchant_id}/features/toggle")
def toggle_merchant_feature(merchant_id: int, data: MerchantToggleFeature,
                           current_user=Depends(require_admin), db: Session = Depends(get_db)):
    """切换商户单个功能"""
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="商户不存在")
    
    enabled = merchant.enabled_features or []
    
    if data.enabled and data.feature_id not in enabled:
        enabled.append(data.feature_id)
    elif not data.enabled and data.feature_id in enabled:
        # 不允许禁用dashboard
        if data.feature_id == "dashboard":
            raise HTTPException(status_code=400, detail="收银台为基础功能，不能禁用")
        enabled.remove(data.feature_id)
    
    merchant.enabled_features = enabled
    db.commit()
    
    return {"message": f"功能已{'启用' if data.enabled else '禁用'}", "enabled_features": enabled}
