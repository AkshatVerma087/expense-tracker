import React, { useState, useEffect } from 'react';
import { getGroups, createGroup, getGroupDetails, addGroupMember, getGroupBalances, getGroupExpenses, createExpense, recordSettlement } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Groups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  
  // Data states
  const [balances, setBalances] = useState(null);
  const [expenses, setExpenses] = useState([]);

  // Modal states
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isAddMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [isExpenseModalOpen, setExpenseModalOpen] = useState(false);
  const [isSettlementModalOpen, setSettlementModalOpen] = useState(false);

  // Form states
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [loading, setLoading] = useState(true);

  // Expense form state
  const [expenseForm, setExpenseForm] = useState({
    description: '', amount: '', currency: 'USD', paidById: user?.id || '', splitType: 'EQUAL', participants: []
  });

  const loadGroups = async () => {
    setLoading(true);
    try {
      const data = await getGroups();
      setGroups(data.groups);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const handleSelectGroup = async (groupId) => {
    try {
      const [groupData, balanceData, expenseData] = await Promise.all([
        getGroupDetails(groupId),
        getGroupBalances(groupId),
        getGroupExpenses(groupId)
      ]);
      setSelectedGroup(groupData.group);
      setBalances(balanceData);
      setExpenses(expenseData.expenses);
      
      // Initialize expense form participants
      const initialParticipants = groupData.group.members.map(m => ({
        userId: m.userId, user: m.user, splitValue: ''
      }));
      setExpenseForm(prev => ({ 
        ...prev, 
        paidById: user?.id || groupData.group.members[0]?.userId || '', 
        participants: initialParticipants 
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateGroup = async () => {
    try {
      await createGroup(newGroupName, newGroupDesc);
      setCreateModalOpen(false);
      setNewGroupName('');
      setNewGroupDesc('');
      loadGroups();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddMember = async () => {
    try {
      await addGroupMember(selectedGroup.id, newMemberEmail);
      setAddMemberModalOpen(false);
      setNewMemberEmail('');
      handleSelectGroup(selectedGroup.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        description: expenseForm.description,
        amount: parseFloat(expenseForm.amount),
        currency: expenseForm.currency,
        paidById: expenseForm.paidById,
        splitType: expenseForm.splitType,
        participants: expenseForm.splitType === 'EQUAL' 
          ? expenseForm.participants.map(p => ({ userId: p.userId }))
          : expenseForm.participants.filter(p => p.splitValue).map(p => ({ userId: p.userId, splitValue: parseFloat(p.splitValue) }))
      };
      
      await createExpense(selectedGroup.id, payload);
      setExpenseModalOpen(false);
      setExpenseForm(prev => ({ ...prev, description: '', amount: '' }));
      handleSelectGroup(selectedGroup.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSettle = async (payerId, receiverId, amount) => {
    if (!window.confirm(`Mark $${amount} as paid?`)) return;
    try {
      await recordSettlement(selectedGroup.id, payerId, receiverId, parseFloat(amount));
      handleSelectGroup(selectedGroup.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const myBalance = balances?.memberBalances?.find(b => b.user.id === user?.id);

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Groups</div>
          <div className="page-sub">Manage your expense groups and members</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateModalOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '14px', height: '14px' }}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New group
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
        {loading ? (
          <div className="empty" style={{ gridColumn: '1 / -1' }}>Loading your groups...</div>
        ) : (
          <>
            {groups.map(g => (
              <div 
                key={g.id} 
                className={`group-card ${selectedGroup?.id === g.id ? 'active-group' : ''}`} 
                onClick={() => handleSelectGroup(g.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>{g.name}</div>
                  <span className="chip">{g.members?.length || 0} active</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{g.description || 'No description'}</div>
              </div>
            ))}
            {groups.length === 0 && <div className="empty" style={{ gridColumn: '1 / -1' }}>No groups found. Create one to get started!</div>}
          </>
        )}
      </div>

      {selectedGroup && balances && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600' }}>{selectedGroup.name} Dashboard</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-primary" onClick={() => setExpenseModalOpen(true)}>Add Expense</button>
            </div>
          </div>

          <div className="metrics">
            <div className="metric">
              <div className="metric-label">Total Group Spend</div>
              <div className="metric-val">${balances.memberBalances.reduce((sum, b) => sum + parseFloat(b.totalPaid), 0).toFixed(2)}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Total You Paid</div>
              <div className="metric-val" style={{ color: 'var(--blue)' }}>${parseFloat(myBalance?.totalPaid || 0).toFixed(2)}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Total You Owe</div>
              <div className="metric-val" style={{ color: 'var(--red)' }}>${parseFloat(myBalance?.totalOwed || 0).toFixed(2)}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Your Net Balance</div>
              <div className="metric-val" style={{ color: parseFloat(myBalance?.netBalance) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {parseFloat(myBalance?.netBalance) > 0 ? '+' : ''}${parseFloat(myBalance?.netBalance || 0).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="two-col">
            <div className="card">
              <div className="card-header">
                <span className="card-title">Recent Expenses</span>
              </div>
              <div>
                {expenses.length === 0 ? <div className="empty">No expenses yet</div> : expenses.map(exp => (
                  <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: '500', fontSize: '13px' }}>{exp.description}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Paid by {exp.paidBy.name}</div>
                    </div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>${parseFloat(exp.amount).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Group Members</span>
                <button className="btn btn-sm" onClick={() => setAddMemberModalOpen(true)}>Invite</button>
              </div>
              <div>
                {selectedGroup.members.map(m => {
                  const b = balances.memberBalances.find(bal => bal.user.id === m.userId);
                  const net = parseFloat(b?.netBalance || 0);
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="av av-a">{m.user.name.substring(0,2).toUpperCase()}</div>
                        <div style={{ fontSize: '13px', fontWeight: '500' }}>{m.user.name}</div>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {net > 0 ? '+' : ''}{net.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="card-header">
                <span className="card-title">How to Settle Up</span>
              </div>
              <div>
                {(!balances.suggestedSettlements || balances.suggestedSettlements.length === 0) ? (
                  <div className="empty">All settled up! No one owes anything.</div>
                ) : (
                  balances.suggestedSettlements.map((s, idx) => (
                    <div key={idx} className="settle-row" style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ fontWeight: '500' }}>{s.fromUser.name}</div>
                      <div style={{ color: 'var(--text3)', fontSize: '12px', margin: '0 8px' }}>owes</div>
                      <div style={{ fontWeight: '500' }}>{s.toUser.name}</div>
                      <div style={{ flex: 1, borderBottom: '1px dashed var(--border)', margin: '0 10px' }}></div>
                      <div style={{ fontWeight: '600', color: 'var(--amber)', marginRight: '16px' }}>${parseFloat(s.amount).toFixed(2)}</div>
                      <button 
                        className="btn btn-sm btn-primary" 
                        onClick={() => handleSettle(s.fromUser.id, s.toUser.id, s.amount)}
                      >
                        Settle
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals for Create Group & Add Member remain the same... */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target.className === 'modal-overlay') setCreateModalOpen(false) }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Create group</span>
              <button className="modal-close" onClick={() => setCreateModalOpen(false)}>×</button>
            </div>
            <div className="form-group">
              <label>Group name</label>
              <input type="text" placeholder="e.g. Goa Trip 2025" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <input type="text" placeholder="Optional description" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn" onClick={() => setCreateModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateGroup}>Create group</button>
            </div>
          </div>
        </div>
      )}

      {isAddMemberModalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target.className === 'modal-overlay') setAddMemberModalOpen(false) }}>
          <div className="modal" style={{ maxWidth: '360px' }}>
            <div className="modal-header">
              <span className="modal-title">Add member</span>
              <button className="modal-close" onClick={() => setAddMemberModalOpen(false)}>×</button>
            </div>
            <div className="form-group">
              <label>User Email</label>
              <input type="email" placeholder="friend@example.com" value={newMemberEmail} onChange={e => setNewMemberEmail(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn" onClick={() => setAddMemberModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddMember}>Add member</button>
            </div>
          </div>
        </div>
      )}

      {isExpenseModalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target.className === 'modal-overlay') setExpenseModalOpen(false) }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Add Expense</span>
              <button className="modal-close" onClick={() => setExpenseModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleCreateExpense}>
              <div className="form-group">
                <label>Description</label>
                <input type="text" required placeholder="Dinner at Joe's" value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Amount</label>
                  <input type="number" step="0.01" required value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Currency</label>
                  <select value={expenseForm.currency} onChange={e => setExpenseForm({...expenseForm, currency: e.target.value})}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="INR">INR</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Paid By</label>
                  <select value={expenseForm.paidById} onChange={e => setExpenseForm({...expenseForm, paidById: e.target.value})}>
                    {selectedGroup.members.map(m => (
                      <option key={m.userId} value={m.userId}>{m.user.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Split Type</label>
                  <select value={expenseForm.splitType} onChange={e => setExpenseForm({...expenseForm, splitType: e.target.value})}>
                    <option value="EQUAL">Equally</option>
                    <option value="UNEQUAL">Exact Amounts</option>
                    <option value="PERCENTAGE">Percentages</option>
                    <option value="SHARE">Shares</option>
                  </select>
                </div>
              </div>
              
              {expenseForm.splitType !== 'EQUAL' && (
                <div className="form-group" style={{ background: 'var(--bg3)', padding: '10px', borderRadius: 'var(--radius)' }}>
                  <label>Split Details</label>
                  {expenseForm.participants.map((p, idx) => (
                    <div key={p.userId} style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', flex: 1 }}>{p.user.name}</span>
                      <input 
                        type="number" 
                        step="0.01"
                        style={{ width: '100px' }}
                        placeholder={expenseForm.splitType === 'PERCENTAGE' ? '%' : expenseForm.splitType === 'SHARE' ? 'Shares' : '$'}
                        value={p.splitValue}
                        onChange={e => {
                          const newParts = [...expenseForm.participants];
                          newParts[idx].splitValue = e.target.value;
                          setExpenseForm({...expenseForm, participants: newParts});
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="btn" onClick={() => setExpenseModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
