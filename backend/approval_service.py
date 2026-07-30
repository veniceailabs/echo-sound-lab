#!/usr/bin/env python3
"""
Approval Service - Simple approval mechanism for processed orders
- Stores pending orders awaiting user approval
- Simple approval API endpoints
- Auto-delivery after approval
"""

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Optional, List
from datetime import datetime
import json
import asyncio

app = FastAPI(title="Echo Sound Lab Approval Service", version="1.0.0")

# In-memory storage (use database in production)
pending_approvals: Dict[str, dict] = {}
websocket_clients: List[WebSocket] = []

class ApprovalRequest(BaseModel):
    order_id: str
    buyer_username: str
    service_type: str
    file_path: str
    metadata: dict
    preview_url: Optional[str] = None

class ApprovalResponse(BaseModel):
    order_id: str
    approved: bool
    notes: Optional[str] = None
    timestamp: str

# WebSocket for real-time notifications
@app.websocket("/ws/approvals")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket connection for real-time approval notifications"""
    await websocket.accept()
    websocket_clients.append(websocket)

    try:
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        websocket_clients.remove(websocket)

# REST API for approvals
@app.post("/pending-approval")
async def add_pending_approval(request: ApprovalRequest) -> dict:
    """Add order to approval queue"""
    pending_approvals[request.order_id] = {
        "order_id": request.order_id,
        "buyer_username": request.buyer_username,
        "service_type": request.service_type,
        "file_path": request.file_path,
        "metadata": request.metadata,
        "preview_url": request.preview_url,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "approved_at": None
    }

    # Broadcast to all connected clients
    message = {
        "type": "new_order",
        "order": pending_approvals[request.order_id]
    }

    for client in websocket_clients:
        try:
            await client.send_json(message)
        except:
            pass

    return {
        "status": "queued",
        "order_id": request.order_id,
        "message": f"Awaiting your approval for {request.buyer_username}'s {request.service_type}"
    }

@app.get("/pending-approvals")
async def list_pending() -> List[dict]:
    """Get all pending orders"""
    return [
        order for order in pending_approvals.values()
        if order["status"] == "pending"
    ]

@app.get("/pending-approvals/{order_id}")
async def get_pending(order_id: str) -> dict:
    """Get specific pending order"""
    if order_id not in pending_approvals:
        raise HTTPException(status_code=404, detail="Order not found")

    return pending_approvals[order_id]

@app.post("/approve/{order_id}")
async def approve_order(order_id: str, notes: Optional[str] = None) -> dict:
    """Approve order for delivery"""
    if order_id not in pending_approvals:
        raise HTTPException(status_code=404, detail="Order not found")

    order = pending_approvals[order_id]
    order["status"] = "approved"
    order["approved_at"] = datetime.now().isoformat()
    order["approval_notes"] = notes or ""

    # Broadcast approval
    for client in websocket_clients:
        try:
            await client.send_json({
                "type": "order_approved",
                "order_id": order_id,
                "timestamp": datetime.now().isoformat()
            })
        except:
            pass

    return {
        "status": "approved",
        "order_id": order_id,
        "message": "Order approved and queued for delivery"
    }

@app.post("/reject/{order_id}")
async def reject_order(order_id: str, reason: Optional[str] = None) -> dict:
    """Reject order (e.g., if quality issues)"""
    if order_id not in pending_approvals:
        raise HTTPException(status_code=404, detail="Order not found")

    order = pending_approvals[order_id]
    order["status"] = "rejected"
    order["rejection_reason"] = reason or "User rejected"

    return {
        "status": "rejected",
        "order_id": order_id,
        "message": "Order rejected. Needs reprocessing."
    }

@app.post("/approve-all")
async def approve_all() -> dict:
    """Approve all pending orders (batch operation)"""
    approved_count = 0

    for order_id, order in pending_approvals.items():
        if order["status"] == "pending":
            order["status"] = "approved"
            order["approved_at"] = datetime.now().isoformat()
            approved_count += 1

    return {
        "approved_count": approved_count,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/stats")
async def get_stats() -> dict:
    """Get approval service statistics"""
    total = len(pending_approvals)
    pending = sum(1 for o in pending_approvals.values() if o["status"] == "pending")
    approved = sum(1 for o in pending_approvals.values() if o["status"] == "approved")
    rejected = sum(1 for o in pending_approvals.values() if o["status"] == "rejected")

    return {
        "total_orders": total,
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "websocket_clients": len(websocket_clients)
    }

@app.get("/health")
async def health() -> dict:
    """Health check"""
    return {
        "status": "healthy",
        "service": "Approval Service",
        "pending_orders": len([o for o in pending_approvals.values() if o["status"] == "pending"])
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
