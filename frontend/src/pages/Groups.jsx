import React, { useState, useEffect } from 'react';
import { getGroups, createGroup, getGroupDetails, addGroupMember, getGroupBalances, getGroupExpenses, createExpense, recordSettlement } from '../api';
import { useAuth } from '../context/AuthContext';
import { getAvatarClass, getInitials } from '../utils/avatar';

export default function Groups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeTab, setActiveTab] = useState('Balances');
  
  // Data states
  const [balances, setBalances] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);

  // Modal states
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isAddMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [isExpenseModalOpen, setExpenseModalOpen] = useState(false);

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
      setGroups(data.groups || []);
      // Auto-select first group if none selected
      if (data.groups && data.groups.length > 0 && !selectedGroup) {
         handleSelectGroup(data.groups[0].id);
      }
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
      const [groupData, balanceData, expenseData, settlementData] = await Promise.all([
        getGroupDetails(groupId),
        getGroupBalances(groupId),
        getGroupExpenses(groupId),
        import('../api').then(api => api.getGroupSettlements(groupId))
      ]);
      setSelectedGroup(groupData.group);
      setBalances(balanceData);
      setExpenses(expenseData.expenses);
      setSettlements(settlementData.settlements);
      
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
    if (!window.confirm(`Mark ₹${amount} as paid?`)) return;
    try {
      await recordSettlement(selectedGroup.id, payerId, receiverId, parseFloat(amount));
      handleSelectGroup(selectedGroup.id);
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

  if (!selectedGroup) {
    return (
      <div>
        <div className="screen-label">Groups</div>
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏠</div>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No Group Selected</div>
          <p className="text-muted" style={{ marginBottom: '24px' }}>Select a group from the dashboard or create a new one.</p>
          <button className="btn btn-primary" onClick={() => setCreateModalOpen(true)}>+ Create New Group</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="screen-label">Group Detail · {activeTab}</div>

      {/* Header */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-16">
            <div style={{ fontSize: '32px' }}>🏠</div>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 700 }}>{selectedGroup.name}</div>
              <div className="text-sm text-muted mt-4">
                {selectedGroup.members.length} members · Default currency {selectedGroup.currency} · Created {new Date(selectedGroup.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
          <div className="flex gap-8">
            <button className="btn btn-outline btn-sm" onClick={() => setActiveTab('Members')}>⚙ Manage Members</button>
            <button className="btn btn-primary btn-sm" onClick={() => setExpenseModalOpen(true)}>+ Add Expense</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '20px' }}>
        {['Balances', 'Expenses', 'Settlements', 'Members'].map(tab => (
          <div 
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
        
        {/* Main Content Area based on Tab */}
        <div>
          {activeTab === 'Balances' && balances && (
            <>
              <div className="card-title" style={{ marginBottom: '12px' }}>Net Balance per Member</div>
              <div className="grid-3" style={{ marginBottom: '20px' }}>
                {balances.memberBalances.map(b => {
                   const net = parseFloat(b.netBalance);
                   const isPositive = net > 0;
                   const isNegative = net < 0;
                   return (
                     <div key={b.user.id} className="card" style={{ textAlign: 'center' }}>
                       <div className={`avatar avatar-lg ${getAvatarClass(b.user.name)}`} style={{ margin: '0 auto 10px' }}>
                         {getInitials(b.user.name)}
                       </div>
                       <div style={{ fontWeight: 600, marginBottom: '2px' }}>{b.user.name}</div>
                       <div className={isPositive ? 'amount-positive' : isNegative ? 'amount-negative' : 'amount-zero'} style={{ fontSize: '18px' }}>
                         {isPositive ? '+' : ''}₹{Math.abs(net).toFixed(2)}
                       </div>
                       <div className="text-xs text-muted mt-4">{isPositive ? 'is owed' : isNegative ? 'owes' : 'settled'}</div>
                       <div className="divider"></div>
                       <div className="text-xs text-muted">Paid ₹{parseFloat(b.totalPaid).toFixed(0)} · Owes ₹{parseFloat(b.totalOwed).toFixed(0)}</div>
                     </div>
                   );
                })}
              </div>
            </>
          )}

          {activeTab === 'Expenses' && (
            <div className="card">
              <div className="flex justify-between items-center" style={{ marginBottom: '14px' }}>
                <div className="card-title" style={{ margin: 0 }}>Expenses</div>
              </div>
              {expenses.length === 0 ? (
                 <div style={{ padding: '20px', textAlign: 'center', color: 'var(--slate-500)' }}>No expenses recorded yet.</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Date</th>
                      <th>Paid by</th>
                      <th>Split</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map(exp => (
                      <tr key={exp.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{exp.description}</div>
                          <div className="text-xs text-muted">{exp.participants.length} participants</div>
                        </td>
                        <td className="text-muted">{new Date(exp.expenseDate).toLocaleDateString()}</td>
                        <td>
                          <div className="flex items-center gap-8">
                            <div className={`avatar avatar-sm ${getAvatarClass(exp.paidBy.name)}`}>{getInitials(exp.paidBy.name)}</div>
                            <span>{exp.paidBy.name}</span>
                          </div>
                        </td>
                        <td><span className="badge badge-sky">{exp.splitType}</span></td>
                        <td className="text-right mono">₹{parseFloat(exp.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'Members' && (
             <div className="card">
                <div className="flex justify-between items-center" style={{ marginBottom: '16px' }}>
                  <div className="card-title" style={{ margin: 0 }}>Group Members</div>
                  <button className="btn btn-primary btn-sm" onClick={() => setAddMemberModalOpen(true)}>+ Add Member</button>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Role</th>
                      <th>Joined</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGroup.members.map(m => (
                       <tr key={m.id}>
                          <td>
                            <div className="flex items-center gap-8">
                              <div className={`avatar avatar-sm ${getAvatarClass(m.user.name)}`}>{getInitials(m.user.name)}</div>
                              <div>
                                <div style={{ fontWeight: 500 }}>{m.user.name}</div>
                                <div className="text-xs text-muted">{m.user.email}</div>
                              </div>
                            </div>
                          </td>
                          <td><span className={m.role === 'ADMIN' ? 'badge badge-indigo' : 'badge badge-slate'}>{m.role}</span></td>
                          <td className="mono text-sm">{new Date(m.joinedAt).toLocaleDateString()}</td>
                          <td><span className="badge badge-green">Active</span></td>
                       </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          )}

          {activeTab === 'Settlements' && (
             <div className="card">
                <div className="card-title">Settlement History</div>
                {settlements.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--slate-500)' }}>
                    No settlements recorded yet.
                  </div>
                ) : (
                  <div>
                    {settlements.map(s => (
                      <div key={s.id} className="flex items-center gap-12" style={{ padding: '10px 0', borderBottom: '1px solid var(--slate-100)' }}>
                        <div style={{ width: '28px', height: '28px', background: 'var(--green-l)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>✓</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500 }}>Settlement — {s.payer.name} → {s.receiver.name}</div>
                          <div className="text-xs text-muted">Recorded by {s.payer.name}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="text-bold mono amount-positive" style={{ fontSize: '13px' }}>₹{parseFloat(s.amount).toFixed(2)}</div>
                          <div className="text-xs text-muted">{new Date(s.date).toLocaleDateString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
             </div>
          )}
        </div>

        {/* Sidebar */}
        <div>
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-title">🎯 Settle Up</div>
            {(!balances?.suggestedSettlements || balances.suggestedSettlements.length === 0) ? (
              <div className="alert alert-success" style={{ marginBottom: '14px' }}>
                <span>✓</span>
                <span>All settled up! No one owes anything.</span>
              </div>
            ) : (
              <>
                <div className="alert alert-info" style={{ marginBottom: '14px' }}>
                  <span>💡</span>
                  <span>{balances.suggestedSettlements.length} payments clear all debts.</span>
                </div>
                {balances.suggestedSettlements.map((s, idx) => (
                  <div key={idx} className="settlement-row">
                    <div className="flex items-center gap-8">
                      <div className={`avatar avatar-sm ${getAvatarClass(s.fromUser.name)}`}>{getInitials(s.fromUser.name)}</div>
                      <span style={{ fontSize: '12px', fontWeight: 500 }}>{s.fromUser.name}</span>
                    </div>
                    <div className="arrow-line"></div>
                    <div className="flex items-center gap-8">
                      <div className={`avatar avatar-sm ${getAvatarClass(s.toUser.name)}`}>{getInitials(s.toUser.name)}</div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>{s.toUser.name}</div>
                        <div className="mono amount-negative" style={{ fontSize: '12px' }}>₹{parseFloat(s.amount).toFixed(2)}</div>
                      </div>
                    </div>
                    <button className="btn btn-success btn-sm" onClick={() => handleSettle(s.fromUser.id, s.toUser.id, s.amount)}>Record</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {isCreateModalOpen && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="card" style={{ width: '400px' }}>
               <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>Create New Group</div>
               <div className="input-group" style={{ marginBottom: '14px' }}>
                 <label className="input-label">Group Name</label>
                 <input className="input" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Goa Trip 2026" />
               </div>
               <div className="input-group" style={{ marginBottom: '24px' }}>
                 <label className="input-label">Description</label>
                 <input className="input" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="Optional" />
               </div>
               <div className="flex justify-between">
                 <button className="btn btn-ghost" onClick={() => setCreateModalOpen(false)}>Cancel</button>
                 <button className="btn btn-primary" onClick={handleCreateGroup}>Create</button>
               </div>
            </div>
         </div>
      )}

      {isAddMemberModalOpen && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="card" style={{ width: '400px' }}>
               <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>Add Member</div>
               <div className="input-group" style={{ marginBottom: '24px' }}>
                 <label className="input-label">User Email</label>
                 <input className="input" type="email" value={newMemberEmail} onChange={e => setNewMemberEmail(e.target.value)} placeholder="friend@example.com" />
               </div>
               <div className="flex justify-between">
                 <button className="btn btn-ghost" onClick={() => setAddMemberModalOpen(false)}>Cancel</button>
                 <button className="btn btn-primary" onClick={handleAddMember}>Add</button>
               </div>
            </div>
         </div>
      )}

      {isExpenseModalOpen && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div className="card" style={{ width: '500px' }}>
               <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>New Expense</div>
               <form onSubmit={handleCreateExpense}>
                 <div className="input-group" style={{ marginBottom: '14px' }}>
                   <label className="input-label">Description</label>
                   <input className="input" required value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} placeholder="Dinner at Joe's" />
                 </div>
                 <div className="grid-2" style={{ marginBottom: '14px' }}>
                   <div className="input-group">
                     <label className="input-label">Amount</label>
                     <div className="input-prefix">
                       <span className="input-prefix-text">₹</span>
                       <input className="input" type="number" step="0.01" required value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} />
                     </div>
                   </div>
                   <div className="input-group">
                     <label className="input-label">Currency</label>
                     <select className="input" value={expenseForm.currency} onChange={e => setExpenseForm({...expenseForm, currency: e.target.value})}>
                       <option value="INR">INR</option>
                       <option value="USD">USD</option>
                       <option value="EUR">EUR</option>
                     </select>
                   </div>
                 </div>
                 <div className="grid-2" style={{ marginBottom: '24px' }}>
                   <div className="input-group">
                     <label className="input-label">Paid By</label>
                     <select className="input" value={expenseForm.paidById} onChange={e => setExpenseForm({...expenseForm, paidById: e.target.value})}>
                       {selectedGroup.members.map(m => (
                         <option key={m.userId} value={m.userId}>{m.user.name}</option>
                       ))}
                     </select>
                   </div>
                   <div className="input-group">
                     <label className="input-label">Split Type</label>
                     <select className="input" value={expenseForm.splitType} onChange={e => setExpenseForm({...expenseForm, splitType: e.target.value})}>
                       <option value="EQUAL">Equal</option>
                       <option value="UNEQUAL">Exact Amounts</option>
                       <option value="PERCENTAGE">Percentages</option>
                       <option value="SHARE">Shares</option>
                     </select>
                   </div>
                 </div>
                 <div className="flex justify-between" style={{ borderTop: '1px solid var(--slate-200)', paddingTop: '16px' }}>
                   <button type="button" className="btn btn-ghost" onClick={() => setExpenseModalOpen(false)}>Cancel</button>
                   <button type="submit" className="btn btn-primary">Save Expense</button>
                 </div>
               </form>
            </div>
         </div>
      )}
    </div>
  );
}
