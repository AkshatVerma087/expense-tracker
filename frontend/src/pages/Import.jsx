import React, { useState, useRef, useEffect } from 'react';
import { uploadCSV, getBatchStatus, resolveRow, commitBatch } from '../api';
import { useNavigate, useParams } from 'react-router-dom';

export default function Import() {
  const navigate = useNavigate();
  const { groupId: routeGroupId, batchId: routeBatchId } = useParams();
  const [step, setStep] = useState(routeBatchId ? 'PROCESSING' : 'UPLOAD');
  const [batchId, setBatchId] = useState(routeBatchId || null);
  const [groupId, setGroupId] = useState(routeGroupId || null);
  const [batchData, setBatchData] = useState(null);
  const [error, setError] = useState(null);
  const [fileData, setFileData] = useState(null);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (routeBatchId && routeGroupId) {
      setStep('PROCESSING');
      // Status poller in the next useEffect will pick this up
    }
  }, [routeBatchId, routeGroupId]);

  const handleFileUpload = async (file) => {
    if (!file) return;
    setError(null);
    setFileData({ name: file.name, size: (file.size / 1024).toFixed(1) + ' KB' });
    setStep('PROCESSING');
    
    try {
      const res = await uploadCSV(file);
      setBatchId(res.batchId);
      setGroupId(res.groupId);
    } catch (err) {
      setError(err.message);
      setStep('UPLOAD');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  useEffect(() => {
    let intervalId;
    
    const checkStatus = async () => {
      try {
        const res = await getBatchStatus(groupId, batchId);
        setBatchData(res.batch);
        
        if (res.batch.status === 'NEEDS_REVIEW' || res.batch.status === 'READY') {
          setStep('REVIEW');
          clearInterval(intervalId);
        } else if (res.batch.status === 'FAILED') {
          setError('Import failed on the server.');
          setStep('UPLOAD');
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error(err);
      }
    };

    if (batchId && groupId && step === 'PROCESSING') {
      intervalId = setInterval(checkStatus, 2000);
    }

    return () => clearInterval(intervalId);
  }, [batchId, groupId, step]);

  const handleResolve = async (rowId, action, updatedData = null) => {
    try {
      await resolveRow(groupId, batchId, rowId, action, updatedData);
      const res = await getBatchStatus(groupId, batchId);
      setBatchData(res.batch);
    } catch (err) {
      alert('Failed to resolve: ' + err.message);
    }
  };

  const handleApproveAllLowMedium = async () => {
    if (!batchData) return;
    const rowsToApprove = new Set();
    
    batchData.rows.forEach(row => {
      if (row.status === 'PENDING' && row.anomalies) {
        // Only if it has NO critical anomalies
        const hasCritical = row.anomalies.some(a => a.severity === 'CRITICAL' && a.status !== 'RESOLVED');
        if (!hasCritical) {
           rowsToApprove.add(row.id);
        }
      }
    });

    if (rowsToApprove.size === 0) {
      alert("No rows with only LOW/MEDIUM anomalies available to approve.");
      return;
    }

    try {
      await Promise.all(Array.from(rowsToApprove).map(rowId => {
        const rowData = batchData.rows.find(r => r.id === rowId).parsedData;
        return resolveRow(groupId, batchId, rowId, 'RESOLVED', rowData);
      }));
      const res = await getBatchStatus(groupId, batchId);
      setBatchData(res.batch);
    } catch (err) {
      alert('Failed to resolve some rows: ' + err.message);
    }
  };

  const handleCommit = async () => {
    setStep('IMPORTING');
    try {
      await commitBatch(batchData.groupId, batchId);
      navigate(`/groups/${batchData.groupId}/import-report/${batchId}`);
    } catch (err) {
      setError(err.message);
      setStep('REVIEW');
    }
  };

  const renderUpload = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
      <div className="card">
        <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>Import Expenses</div>
        <div className="text-sm text-muted" style={{ marginBottom: '20px' }}>Upload your spreadsheet and we'll detect every anomaly, auto-create a group, and invite members.</div>

        {/* Drop zone */}
        <div 
          onDragOver={e => e.preventDefault()} 
          onDrop={handleDrop}
          onClick={() => fileInputRef.current.click()}
          style={{ 
            border: '2px dashed var(--slate-300)', 
            borderRadius: 'var(--radius-lg)', 
            padding: '48px 24px', 
            textAlign: 'center', 
            background: 'var(--slate-50)', 
            cursor: 'pointer',
            transition: 'all .2s'
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor='var(--indigo)'; e.currentTarget.style.background='var(--indigo-l)'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor='var(--slate-300)'; e.currentTarget.style.background='var(--slate-50)'; }}
        >
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>Drop your .xlsx or .csv file here</div>
          <div className="text-sm text-muted" style={{ marginBottom: '16px' }}>or click to browse · Max 10 MB</div>
          <button className="btn btn-outline" style={{ pointerEvents: 'none' }}>Choose File</button>
          <input 
            type="file" 
            accept=".csv" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={(e) => handleFileUpload(e.target.files[0])}
          />
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginTop: '16px' }}>
            <span>⚠</span><span>{error}</span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">What we check</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="flex items-center gap-8"><span>🗓</span><span className="text-sm">Date format</span></div>
          <div className="flex items-center gap-8"><span>👥</span><span className="text-sm">Member names & auto-creation</span></div>
          <div className="flex items-center gap-8"><span>📋</span><span className="text-sm">Exact & conflicting duplicates</span></div>
          <div className="flex items-center gap-8"><span>💱</span><span className="text-sm">USD → INR conversion</span></div>
          <div className="flex items-center gap-8"><span>%</span><span className="text-sm">Percentage splits</span></div>
          <div className="flex items-center gap-8"><span>💸</span><span className="text-sm">Settlements vs expenses</span></div>
        </div>
        <div className="divider"></div>
        <div className="alert alert-info">
          <span>🔒</span><span style={{ fontSize: '12px' }}>Nothing is saved until you confirm anomalies.</span>
        </div>
      </div>
    </div>
  );

  const renderReview = () => {
    if (!batchData) return null;
    
    const allAnomalies = [];
    batchData.rows.forEach(row => {
      if (row.status === 'PENDING' && row.anomalies) {
        row.anomalies.forEach(anomaly => {
          allAnomalies.push({ row, anomaly });
        });
      }
    });

    const criticalCount = allAnomalies.filter(a => a.anomaly.severity === 'CRITICAL').length;
    const mediumCount = allAnomalies.filter(a => a.anomaly.severity === 'MEDIUM').length;
    const totalAnomalies = batchData.rows.reduce((acc, r) => acc + (r.anomalies ? r.anomalies.length : 0), 0);
    const resolvedCount = totalAnomalies - allAnomalies.length;
    const progressPercent = totalAnomalies === 0 ? 100 : Math.round((resolvedCount / totalAnomalies) * 100);

    const isValid = allAnomalies.length === 0 && batchData.status === 'READY';
    const canCommit = allAnomalies.length === 0; // Backend requires all anomalies to be explicitly skipped/approved

    return (
      <div className="review-layout">
        {/* Sticky Sidebar */}
        <div className="review-sidebar">
          <div style={{ fontWeight: 700, marginBottom: '14px' }}>Review Progress</div>
          <div style={{ marginBottom: '16px' }}>
            <div className="flex justify-between text-xs text-muted" style={{ marginBottom: '6px' }}>
              <span>Resolved</span><span>{resolvedCount} / {totalAnomalies}</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progressPercent}%`, background: 'var(--indigo)' }}></div>
            </div>
          </div>
          <div className="divider"></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-8"><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--red)' }}></div><span className="text-sm">Critical</span></div>
              <span className="badge badge-red">{criticalCount} left</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-8"><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--amber)' }}></div><span className="text-sm">Medium</span></div>
              <span className="badge badge-amber">{mediumCount} left</span>
            </div>
          </div>
          <div className="divider"></div>
          {criticalCount > 0 && (
            <div className="alert alert-warning" style={{ marginBottom: '12px' }}>
              <span>⚠</span><span style={{ fontSize: '11px' }}>{criticalCount} critical anomalies must be resolved.</span>
            </div>
          )}
          {mediumCount > 0 && (
            <button 
               className="btn btn-outline btn-sm full-width" 
               style={{ marginBottom: '12px', justifyContent: 'center' }} 
               onClick={handleApproveAllLowMedium}
            >
              ✓ Approve All Low/Medium
            </button>
          )}
          <button 
            className={`btn full-width ${canCommit ? 'btn-primary' : ''}`} 
            style={{ justifyContent: 'center', cursor: canCommit ? 'pointer' : 'not-allowed', background: canCommit ? '' : 'var(--slate-300)', color: canCommit ? '' : 'var(--slate-500)' }} 
            disabled={!canCommit}
            onClick={handleCommit}
          >
            Commit Import
          </button>
          {error && <div className="text-xs text-muted mt-8" style={{ color: 'var(--red)' }}>{error}</div>}
        </div>

        {/* Anomaly Cards */}
        <div>
          {allAnomalies.length === 0 ? (
             <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
                <h3>All anomalies resolved!</h3>
                <p className="text-muted">You're ready to commit the import.</p>
             </div>
          ) : (
             allAnomalies.map(({row, anomaly}, idx) => {
               const isCritical = anomaly.severity === 'CRITICAL';
               const isMedium = anomaly.severity === 'MEDIUM';
               const code = anomaly.code;

               let specificUI = null;

               // A-03: Conflicting Duplicate (Simulated Side-by-Side)
               if (code === 'A-03' || code === 'A-02') {
                 specificUI = (
                   <div className="grid-2" style={{ marginBottom: '12px' }}>
                     <div className="card card-sm" style={{ borderColor: isCritical ? '#FECACA' : 'var(--amber)' }}>
                       <div className="text-xs text-muted" style={{ marginBottom: '6px' }}>Current Row {row.parsedData.rowNumber}</div>
                       <div style={{ fontWeight: 600, fontSize: '13px' }}>{row.parsedData.description}</div>
                       <div className="text-sm" style={{ marginTop: '4px' }}>Paid by: <strong>{row.parsedData.paidBy || 'Unknown'}</strong> · {row.parsedData.currency} {row.parsedData.amount}</div>
                       <div className="text-xs text-muted" style={{ marginTop: '4px' }}>{row.parsedData.date}</div>
                       <button className="btn btn-outline btn-sm" style={{ marginTop: '8px', borderColor: 'var(--green)', color: 'var(--green)' }} onClick={() => handleResolve(row.id, 'RESOLVED', row.parsedData)}>✓ Keep this</button>
                     </div>
                     <div className="card card-sm" style={{ borderColor: 'var(--slate-200)', background: 'var(--slate-50)' }}>
                       <div className="text-xs text-muted" style={{ marginBottom: '6px' }}>Conflicting Database Record</div>
                       <div style={{ fontWeight: 600, fontSize: '13px' }}>{anomaly.message.substring(0, 40)}...</div>
                       <div className="text-sm text-muted" style={{ marginTop: '4px' }}>Found in system</div>
                       <button className="btn btn-outline btn-sm" style={{ marginTop: '8px' }} onClick={() => handleResolve(row.id, 'SKIP')}>✓ Keep existing (Skip row)</button>
                     </div>
                   </div>
                 );
               } 
               // A-05: Percentage Sum Invalid
               else if (code === 'A-05') {
                 const splits = row.parsedData.splitDetails ? row.parsedData.splitDetails.split(';') : [];
                 specificUI = (
                   <div className="card card-sm" style={{ background: 'var(--slate-50)', marginBottom: '12px' }}>
                     <div className="text-xs text-muted" style={{ marginBottom: '8px' }}>Current split (total: <strong style={{ color: 'var(--red)' }}>Invalid</strong>)</div>
                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
                       {splits.map((s, i) => (
                         <div key={i} className="input-group">
                           <input className="input" defaultValue={s.trim()} style={{ borderColor: 'var(--red)' }} />
                         </div>
                       ))}
                     </div>
                     <div className="alert alert-error mt-8">⚠ Must equal exactly 100%.</div>
                     <button className="btn btn-primary btn-sm mt-8" onClick={() => {
                        const newSplit = prompt("Enter corrected percentage split (e.g. 'Aisha 50; Rohan 50')");
                        if (newSplit) handleResolve(row.id, 'EDIT', { ...row.parsedData, splitDetails: newSplit });
                     }}>Save corrected split</button>
                   </div>
                 );
               }
               // A-04 or A-16: Settlement as Expense
               else if (code === 'A-04' || code === 'A-16') {
                 specificUI = (
                   <div className="flex gap-8">
                     <div className="badge badge-green">Settlement: {row.parsedData.paidBy} → {row.parsedData.description} · {row.parsedData.currency} {row.parsedData.amount}</div>
                     <button className="btn btn-success btn-sm" onClick={() => handleResolve(row.id, 'Import as Settlement', row.parsedData)}>✓ Approve as Settlement</button>
                     <button className="btn btn-ghost btn-sm" onClick={() => handleResolve(row.id, 'SKIP')}>Skip</button>
                   </div>
                 );
               }
               // Default Generic UI
               else {
                 specificUI = (
                   <>
                     <div className="card card-sm" style={{ background: 'var(--slate-50)', border: '1px dashed var(--slate-300)', marginBottom: '16px', fontFamily: 'monospace', fontSize: '12px', overflowX: 'auto', color: 'var(--slate-700)' }}>
                       {JSON.stringify(row.rawRowData)}
                     </div>
                     <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                       {anomaly.options ? (
                         anomaly.options.map((opt, i) => (
                           <button key={i} className="btn btn-outline btn-sm" onClick={() => {
                             if (code === 'A-15') handleResolve(row.id, 'RESOLVED', { ...row.parsedData, date: opt });
                             else if (code === 'A-08') handleResolve(row.id, 'RESOLVED', { ...row.parsedData, currency: opt });
                             else if (code === 'A-07' || code === 'A-10') handleResolve(row.id, 'RESOLVED', { ...row.parsedData, payerEmail: opt });
                             else handleResolve(row.id, opt, row.parsedData);
                           }}>{opt}</button>
                         ))
                       ) : (
                         <>
                           <button className="btn btn-success btn-sm" onClick={() => handleResolve(row.id, 'RESOLVED', row.parsedData)}>✓ Approve</button>
                           <button className="btn btn-ghost btn-sm" onClick={() => handleResolve(row.id, 'SKIP')}>Skip Row</button>
                           <button className="btn btn-outline btn-sm" onClick={() => {
                             const updatedDescription = prompt('Edit description:', row.parsedData?.description || '');
                             if (updatedDescription) handleResolve(row.id, 'EDIT', { ...row.parsedData, description: updatedDescription });
                           }}>Edit Details</button>
                         </>
                       )}
                     </div>
                   </>
                 );
               }
               
               // Wrapper Card
               const wrapperClass = isCritical ? 'anomaly-critical' : isMedium ? 'anomaly-medium' : 'anomaly-low';
               
               return (
                 <div key={`${row.id}-${idx}`} className={`anomaly-card ${wrapperClass}`} style={{ marginBottom: '16px' }}>
                   <div className="flex justify-between items-center" style={{ marginBottom: '16px' }}>
                     <div className="flex items-center gap-8">
                       <span className={`badge ${isCritical ? 'badge-red' : isMedium ? 'badge-amber' : 'badge-slate'}`}>
                         {isCritical ? '🔴 CRITICAL' : isMedium ? '🟡 MEDIUM' : '⚪ LOW'} · {code}
                       </span>
                       <span className="text-muted text-sm">Row {row.parsedData.rowNumber}</span>
                       <span style={{ fontSize: '14px', fontWeight: 600 }}>{anomaly.type}</span>
                     </div>
                     {isCritical && <span className="badge badge-red">⛔ BLOCKED</span>}
                   </div>
                   
                   <div style={{ fontSize: '13px', marginBottom: '12px', color: 'var(--slate-700)' }}>
                     {anomaly.message}
                   </div>

                   {specificUI}
                 </div>
               );
             })
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="screen-label">Global Import Center</div>
      
      {step === 'UPLOAD' && renderUpload()}
      
      {step === 'PROCESSING' && (
        <div className="card" style={{ textAlign: 'center', padding: '80px 40px' }}>
          <h2>Processing CSV...</h2>
          <p className="text-muted" style={{ marginTop: '8px' }}>Running 18 Anomaly Engine checks and creating group spaces...</p>
        </div>
      )}
      
      {step === 'REVIEW' && renderReview()}
      
      {step === 'IMPORTING' && (
        <div className="card" style={{ textAlign: 'center', padding: '80px 40px' }}>
          <h2>Committing Ledger...</h2>
        </div>
      )}
      
      {step === 'SUCCESS' && (
        <div className="card" style={{ textAlign: 'center', padding: '80px 40px' }}>
          <div style={{ width: '64px', height: '64px', background: 'var(--green)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '24px' }}>✓</div>
          <h2 style={{ fontSize: '24px', fontWeight: 700 }}>Import Complete!</h2>
          <p className="text-muted" style={{ marginBottom: '32px' }}>A new group has been created and all users were successfully invited.</p>
          <button className="btn btn-primary" onClick={() => navigate('/groups')}>View Group Ledger</button>
        </div>
      )}
    </div>
  );
}
