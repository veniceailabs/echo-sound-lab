import React, { useState, useEffect, useRef } from 'react';
import './FiverrApprovalDashboard.css';

interface PendingOrder {
  order_id: string;
  buyer_username: string;
  service_type: string;
  file_path: string;
  metadata: any;
  preview_url?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  approved_at?: string;
}

export const FiverrApprovalDashboard: React.FC = () => {
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8001/ws/approvals`);

    ws.onopen = () => {
      setConnectionStatus('connected');
      console.log('Connected to approval service');
      fetchPendingOrders();
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'new_order') {
        console.log('New order received:', data.order);
        fetchPendingOrders();
      } else if (data.type === 'order_approved') {
        console.log('Order approved:', data.order_id);
        fetchPendingOrders();
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('disconnected');
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      // Reconnect after 5 seconds
      setTimeout(() => {
        console.log('Attempting to reconnect...');
      }, 5000);
    };

    wsRef.current = ws;

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  // Fetch pending orders
  const fetchPendingOrders = async () => {
    try {
      const response = await fetch('http://localhost:8001/pending-approvals');
      const orders = await response.json();
      setPendingOrders(orders);

      // Fetch stats
      const statsResponse = await fetch('http://localhost:8001/stats');
      const statsData = await statsResponse.json();
      setStats({
        pending: statsData.pending,
        approved: statsData.approved,
        rejected: statsData.rejected
      });
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  };

  const handleApprove = async (orderId: string) => {
    try {
      const response = await fetch(`http://localhost:8001/approve/${orderId}`, {
        method: 'POST'
      });

      if (response.ok) {
        alert(`âœOrder ${orderId} approved! Auto-delivering to Fiverr...`);
        fetchPendingOrders();
        setSelectedOrder(null);
      }
    } catch (error) {
      console.error('Failed to approve order:', error);
      alert('Failed to approve order');
    }
  };

  const handleReject = async (orderId: string) => {
    const reason = window.prompt('Why are you rejecting this order?');
    if (!reason) return;

    try {
      const response = await fetch(`http://localhost:8001/reject/${orderId}`, {
        method: 'POST'
      });

      if (response.ok) {
        alert(`âOrder ${orderId} rejected. Will be reprocessed.`);
        fetchPendingOrders();
        setSelectedOrder(null);
      }
    } catch (error) {
      console.error('Failed to reject order:', error);
      alert('Failed to reject order');
    }
  };

  const handleApproveAll = async () => {
    if (!window.confirm(`Approve all ${stats.pending} pending orders?`)) return;

    try {
      const response = await fetch('http://localhost:8001/approve-all', {
        method: 'POST'
      });

      if (response.ok) {
        alert(`âœAll ${stats.pending} orders approved!`);
        fetchPendingOrders();
      }
    } catch (error) {
      console.error('Failed to approve all:', error);
      alert('Failed to approve all orders');
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const getServiceIcon = (serviceType: string) => {
    switch (serviceType) {
      case 'mixing':
        return 'ğŸšï¸';
      case 'mastering':
        return 'ğŸ†';
      case 'ab_mastering':
        return 'ğŸ”„';
      default:
        return 'ğŸµ';
    }
  };

  return (
    <div className="fiverr-approval-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <h1>ğŸ¤Fiverr Automation Approval</h1>
          <p>Auto-process Fiverr orders. Review & approve before delivery.</p>
        </div>

        <div className="header-stats">
          <div className="stat-box pending">
            <div className="stat-number">{stats.pending}</div>
            <div className="stat-label">Pending</div>
          </div>
          <div className="stat-box approved">
            <div className="stat-number">{stats.approved}</div>
            <div className="stat-label">Approved</div>
          </div>
          <div className="stat-box rejected">
            <div className="stat-number">{stats.rejected}</div>
            <div className="stat-label">Rejected</div>
          </div>
        </div>

        <div className={`connection-status ${connectionStatus}`}>
          <span className="status-dot"></span>
          {connectionStatus === 'connected' ? 'Live' : 'Offline'}
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        {/* Orders List */}
        <div className="orders-section">
          <div className="section-header">
            <h2>Pending Processing ({pendingOrders.length})</h2>
            {stats.pending > 0 && (
              <button className="approve-all-btn" onClick={handleApproveAll}>
                âœApprove All
              </button>
            )}
          </div>

          {pendingOrders.length === 0 ? (
            <div className="empty-state">
              <p>ğŸAll caught up! No pending orders.</p>
              <p className="empty-subtext">New Fiverr orders will appear here automatically.</p>
            </div>
          ) : (
            <div className="orders-list">
              {pendingOrders.map((order) => (
                <div
                  key={order.order_id}
                  className={`order-card ${selectedOrder?.order_id === order.order_id ? 'selected' : ''}`}
                  onClick={() => setSelectedOrder(order)}
                >
                  <div className="order-header">
                    <div className="order-title">
                      <span className="service-icon">{getServiceIcon(order.service_type)}</span>
                      <span className="service-name">{order.service_type.replace('_', ' ').toUpperCase()}</span>
                    </div>
                    <span className={`status-badge ${order.status}`}>
                      {order.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="order-details">
                    <div className="detail-row">
                      <span className="detail-label">Client:</span>
                      <span className="detail-value">{order.buyer_username}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Order ID:</span>
                      <span className="detail-value">{order.order_id}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Processed:</span>
                      <span className="detail-value">{formatTime(order.created_at)}</span>
                    </div>
                  </div>

                  {order.preview_url && (
                    <div className="preview-text">
                      {order.preview_url}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="detail-section">
          {selectedOrder ? (
            <div className="detail-panel">
              <h2>Order Details</h2>

              <div className="detail-group">
                <label>Service Type</label>
                <div className="value">{selectedOrder.service_type.replace('_', ' ').toUpperCase()}</div>
              </div>

              <div className="detail-group">
                <label>Client</label>
                <div className="value">{selectedOrder.buyer_username}</div>
              </div>

              <div className="detail-group">
                <label>Order ID</label>
                <div className="value">{selectedOrder.order_id}</div>
              </div>

              <div className="detail-group">
                <label>Processed</label>
                <div className="value">{formatTime(selectedOrder.created_at)}</div>
              </div>

              {selectedOrder.metadata && (
                <>
                  {selectedOrder.metadata.genre && (
                    <div className="detail-group">
                      <label>Genre</label>
                      <div className="value">{selectedOrder.metadata.genre}</div>
                    </div>
                  )}

                  {selectedOrder.metadata.style && (
                    <div className="detail-group">
                      <label>Style</label>
                      <div className="value">{selectedOrder.metadata.style}</div>
                    </div>
                  )}
                </>
              )}

              {selectedOrder.preview_url && (
                <div className="detail-group">
                  <label>Status</label>
                  <div className="value">{selectedOrder.preview_url}</div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="action-buttons">
                <button
                  className="approve-btn"
                  onClick={() => handleApprove(selectedOrder.order_id)}
                >
                  âœApprove & Deliver
                </button>
                <button
                  className="reject-btn"
                  onClick={() => handleReject(selectedOrder.order_id)}
                >
                  âReject & Reprocess
                </button>
              </div>

              <div className="info-box">
                <strong>Next Steps:</strong>
                <ul>
                  <li>Review the processing details above</li>
                  <li>Click "Approve & Deliver" to auto-send to Fiverr</li>
                  <li>Click "Reject" if you want reprocessing</li>
                  <li>Once approved, order automatically posts to Fiverr</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="empty-detail">
              <p>ğŸ‘Select an order to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="dashboard-footer">
        <button onClick={fetchPendingOrders} className="refresh-btn">
          ğŸ”Refresh
        </button>
        <p className="footer-text">
          Automation running. Orders checked every 60 seconds.
        </p>
      </div>
    </div>
  );
};
