import React, { useState, useEffect } from 'react';
import { getGroups, getDashboardMetrics } from '../api';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { getAvatarClass, getInitials } from '../utils/avatar';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [metrics, setMetrics] = useState({ totalPaid: 0, totalOwed: 0, netBalance: 0, groupsCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [groupsData, metricsData] = await Promise.all([
          getGroups(),
          getDashboardMetrics()
        ]);
        
        setGroups(groupsData.groups || []);
        setMetrics(metricsData);
      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchDashboardData();
    }
  }, [user]);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading Dashboard...</div>;
  }

  return (
    <div>
      <div className="screen-label">Dashboard</div>
      
      {/* Stat Row */}
      <div className="grid-4" style={{ marginBottom: '20px' }}>
        <div className="stat-card">
          <div className="stat-label">Global Net Balance</div>
          <div className={`stat-value ${metrics.netBalance >= 0 ? 'amount-positive' : 'amount-negative'}`}>
            {metrics.netBalance >= 0 ? '+' : '-'}₹{Math.abs(metrics.netBalance).toFixed(2)}
          </div>
          <div className="stat-sub">across {metrics.groupsCount} groups</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total You Paid</div>
          <div className="stat-value amount-positive">₹{metrics.totalPaid.toFixed(2)}</div>
          <div className="stat-sub">lifetime</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total You Owe</div>
          <div className="stat-value amount-negative">₹{metrics.totalOwed.toFixed(2)}</div>
          <div className="stat-sub">lifetime</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active groups</div>
          <div className="stat-value" style={{ color: 'var(--slate-800)' }}>{metrics.groupsCount}</div>
          <div className="stat-sub">Your collaborative spaces</div>
        </div>
      </div>

      {/* Groups + Recent */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Groups */}
        <div className="card">
          <div className="flex justify-between items-center" style={{ marginBottom: '16px' }}>
            <div className="card-title" style={{ margin: 0 }}>Your Groups</div>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/groups')}>+ New Group</button>
          </div>

          {groups.length === 0 ? (
            <p className="text-muted text-sm">You are not part of any groups yet.</p>
          ) : (
            groups.map(group => (
              <div key={group.id} className="card card-sm" style={{ marginBottom: '10px', cursor: 'pointer' }} onClick={() => navigate('/groups')}>
                <div className="flex justify-between items-center">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{group.name}</div>
                    <div className="text-sm text-muted mt-4">{group.description || 'No description'} · {group.currency} default</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                     <button className="btn btn-ghost btn-sm">Open →</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Recent Activity / Quick Actions */}
        <div className="card">
          <div className="card-title">Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button className="btn btn-primary full-width" onClick={() => navigate('/groups')} style={{ justifyContent: 'center', padding: '12px' }}>
              Create a New Group
            </button>
            <button className="btn btn-outline full-width" onClick={() => navigate('/import')} style={{ justifyContent: 'center', padding: '12px' }}>
              Import CSV Statement
            </button>
          </div>
          <div className="divider"></div>
          <div className="alert alert-info">
             <span>💡</span>
             <span>Tip: Drop your bank CSV in the Import tab to auto-create groups and members instantly.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
