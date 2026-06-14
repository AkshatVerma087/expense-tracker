import React, { useState, useEffect } from 'react';
import { getGroups, getGroupBalances } from '../api';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [metrics, setMetrics] = useState({ totalPaid: 0, totalOwed: 0, netBalance: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const { groups } = await getGroups();
        setGroups(groups || []);
        
        let totalPaid = 0;
        let totalOwed = 0;
        let netBalance = 0;

        // Fetch balances for each group to aggregate
        for (const group of groups || []) {
          try {
            const { balances } = await getGroupBalances(group.id);
            const myBalance = balances.find(b => b.user.id === user.id);
            if (myBalance) {
              totalPaid += parseFloat(myBalance.totalPaid);
              totalOwed += parseFloat(myBalance.totalOwed);
              netBalance += parseFloat(myBalance.netBalance);
            }
          } catch (e) {
            console.error(`Failed to fetch balances for group ${group.id}`);
          }
        }
        
        setMetrics({ totalPaid, totalOwed, netBalance });
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
    <div className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Welcome back, {user?.name}!</div>
        </div>
      </div>
      
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>Global Finances</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          <div style={{ padding: '16px', background: 'var(--bg2)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Total You Paid</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text1)' }}>${metrics.totalPaid.toFixed(2)}</div>
          </div>
          <div style={{ padding: '16px', background: 'var(--bg2)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Total You Owe</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text1)' }}>${metrics.totalOwed.toFixed(2)}</div>
          </div>
          <div style={{ padding: '16px', background: 'var(--bg2)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Global Net Balance</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: metrics.netBalance >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {metrics.netBalance >= 0 ? '+' : '-'}${Math.abs(metrics.netBalance).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="card">
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>Your Groups</h2>
          {groups.length === 0 ? (
            <p style={{ color: 'var(--text3)' }}>You are not part of any groups yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {groups.map(group => (
                <div key={group.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <div>
                    <div style={{ fontWeight: '500' }}>{group.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{group.description || 'No description'}</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => navigate('/groups')}>Open</button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="card">
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>Quick Actions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
             <button className="btn btn-primary" onClick={() => navigate('/groups')} style={{ width: '100%', justifyContent: 'flex-start' }}>Create a New Group</button>
             <button className="btn" onClick={() => navigate('/import')} style={{ width: '100%', justifyContent: 'flex-start' }}>Import CSV Statement</button>
          </div>
        </div>
      </div>
    </div>
  );
}
