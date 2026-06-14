import React, { useState, useRef, useEffect } from 'react';
import { getGroups, uploadCSV, getBatchStatus, resolveRow, commitBatch } from '../api';

export default function Import() {
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [step, setStep] = useState('UPLOAD'); // UPLOAD, PROCESSING, REVIEW, IMPORTING, SUCCESS
  const [batchId, setBatchId] = useState(null);
  const [batchData, setBatchData] = useState(null);
  const [error, setError] = useState(null);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    getGroups().then(data => {
      setGroups(data.groups || []);
    }).catch(console.error);
  }, []);

  const handleFileUpload = async (file) => {
    if (!file || !selectedGroupId) return;
    setError(null);
    setStep('PROCESSING');
    
    try {
      const res = await uploadCSV(selectedGroupId, file);
      setBatchId(res.batchId);
    } catch (err) {
      setError(err.message);
      setStep('UPLOAD');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (!selectedGroupId) {
       setError("Please select a group first.");
       return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  useEffect(() => {
    let intervalId;
    
    const checkStatus = async () => {
      try {
        const res = await getBatchStatus(selectedGroupId, batchId);
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

    if (batchId && step === 'PROCESSING') {
      intervalId = setInterval(checkStatus, 2000);
    }

    return () => clearInterval(intervalId);
  }, [batchId, step, selectedGroupId]);

  const handleResolve = async (rowId, action, updatedData = null) => {
    try {
      await resolveRow(selectedGroupId, batchId, rowId, action, updatedData);
      const res = await getBatchStatus(selectedGroupId, batchId);
      setBatchData(res.batch);
    } catch (err) {
      alert('Failed to resolve: ' + err.message);
    }
  };

  const handleCommit = async () => {
    setStep('IMPORTING');
    try {
      await commitBatch(selectedGroupId, batchId);
      setStep('SUCCESS');
    } catch (err) {
      setError(err.message);
      setStep('REVIEW');
    }
  };

  const renderUpload = () => (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text2)' }}>Select Group to Import Into</label>
        <select 
          value={selectedGroupId} 
          onChange={(e) => setSelectedGroupId(e.target.value)}
          className="input"
          style={{ width: '100%', padding: '12px' }}
        >
          <option value="">-- Select a Group --</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      <div 
        className="dropzone" 
        onDragOver={e => e.preventDefault()} 
        onDrop={handleDrop}
        onClick={() => {
          if (!selectedGroupId) {
             setError("Please select a group first.");
             return;
          }
          fileInputRef.current.click();
        }}
        style={{ 
          border: '2px dashed var(--border)', 
          borderRadius: 'var(--radius)', 
          padding: '60px 40px', 
          textAlign: 'center', 
          cursor: selectedGroupId ? 'pointer' : 'not-allowed', 
          background: 'var(--bg2)',
          opacity: selectedGroupId ? 1 : 0.5
        }}
      >
        <input 
          type="file" 
          accept=".csv" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={(e) => handleFileUpload(e.target.files[0])}
        />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '48px', height: '48px', color: 'var(--text3)', marginBottom: '16px' }}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <h3>Drop your bank CSV here</h3>
        <p style={{ color: 'var(--text3)', marginTop: '8px' }}>or click to browse files</p>
      </div>
      {error && <p style={{ color: 'var(--red)', marginTop: '16px', textAlign: 'center' }}>{error}</p>}
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

    const isValid = allAnomalies.length === 0 && batchData.status === 'READY';
    
    return (
      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2>Review Anomalies</h2>
        <div style={{ marginBottom: '16px', padding: '12px', background: isValid ? 'var(--green-light)' : 'var(--amber-light)', color: isValid ? 'var(--green-dark)' : 'var(--amber-dark)', borderRadius: 'var(--radius)' }}>
          {isValid ? 'All anomalies resolved! Ready to import.' : `Found ${allAnomalies.length} anomalies that need your attention.`}
        </div>
        
        <div style={{ maxHeight: '500px', overflowY: 'auto', marginBottom: '20px' }}>
          {allAnomalies.map(({row, anomaly}, idx) => (
            <div key={`${row.id}-${idx}`} style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <strong style={{ fontSize: '1.1em' }}>Row {row.parsedData.rowNumber} - {anomaly.type}</strong>
                <span className="chip" style={{ background: anomaly.severity === 'CRITICAL' ? 'var(--red-light)' : 'var(--amber-light)', color: anomaly.severity === 'CRITICAL' ? 'var(--red-dark)' : 'var(--amber-dark)' }}>{anomaly.code}</span>
              </div>
              <div style={{ marginBottom: '12px', color: 'var(--text2)' }}>
                {anomaly.message}
              </div>
              <div style={{ fontSize: '13px', fontFamily: 'monospace', background: 'var(--bg2)', padding: '12px', borderRadius: '4px', marginBottom: '16px', overflowX: 'auto' }}>
                {JSON.stringify(row.rawRowData)}
              </div>
              
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {anomaly.options ? (
                  anomaly.options.map((opt, i) => (
                    <button key={i} className="btn" onClick={() => {
                      if (anomaly.code === 'A-15') {
                        handleResolve(row.id, 'RESOLVED', { ...row.parsedData, date: opt });
                      } else if (anomaly.code === 'A-08') {
                        handleResolve(row.id, 'RESOLVED', { ...row.parsedData, currency: opt });
                      } else if (anomaly.code === 'A-07' || anomaly.code === 'A-10') {
                        handleResolve(row.id, 'RESOLVED', { ...row.parsedData, payerEmail: opt });
                      } else if (anomaly.code === 'A-04_16') {
                        handleResolve(row.id, opt, row.parsedData);
                      } else {
                        handleResolve(row.id, opt, row.parsedData);
                      }
                    }}>
                      {opt}
                    </button>
                  ))
                ) : (
                  <>
                    <button className="btn" onClick={() => handleResolve(row.id, 'SKIP')}>Skip Row</button>
                    <button className="btn" onClick={() => {
                      const updatedDescription = prompt('Fix this issue by editing the description:', row.parsedData?.description || '');
                      if (updatedDescription) {
                        handleResolve(row.id, 'EDIT', { ...row.parsedData, description: updatedDescription });
                      }
                    }}>Edit Description</button>
                    <button className="btn" onClick={() => {
                      const updatedDetails = prompt('Fix this issue by editing the split details (e.g. "Aisha 40; Rohan 60"):', row.parsedData?.splitDetails || '');
                      if (updatedDetails) {
                        handleResolve(row.id, 'EDIT', { ...row.parsedData, splitDetails: updatedDetails });
                      }
                    }}>Edit Split Details</button>
                  </>
                )}
              </div>
            </div>
          ))}
          
          {allAnomalies.length === 0 && batchData.rows.filter(r => r.status === 'RESOLVED').slice(0,5).map(row => (
            <div key={row.id} style={{ padding: '12px', borderBottom: '1px solid var(--border)', fontSize: '14px' }}>
              <span style={{ color: 'var(--green)', marginRight: '8px' }}>✓</span>
              {row.parsedData.description} - {row.parsedData.currency} {row.parsedData.amount}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button className="btn" onClick={() => setStep('UPLOAD')}>Cancel</button>
          <button className="btn btn-primary" disabled={!isValid} onClick={handleCommit}>Complete Import</button>
        </div>
        {error && <p style={{ color: 'var(--red)', marginTop: '16px', textAlign: 'right' }}>{error}</p>}
      </div>
    );
  };

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">CSV Importer Engine</div>
          <div className="page-sub">Upload bank statements or shared spreadsheets and let our AI sort it out.</div>
        </div>
      </div>
      
      {step === 'UPLOAD' && renderUpload()}
      
      {step === 'PROCESSING' && (
        <div style={{ textAlign: 'center', padding: '80px 40px' }}>
          <div className="spinner" style={{ margin: '0 auto 24px', width: '40px', height: '40px', border: '3px solid var(--border)', borderTopColor: 'var(--green)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
          <h2>Processing CSV...</h2>
          <p style={{ color: 'var(--text3)' }}>Running 18 Anomaly Engine checks...</p>
        </div>
      )}
      
      {step === 'REVIEW' && renderReview()}
      
      {step === 'IMPORTING' && (
        <div style={{ textAlign: 'center', padding: '80px 40px' }}>
          <div className="spinner" style={{ margin: '0 auto 24px', width: '40px', height: '40px', border: '3px solid var(--border)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <h2>Importing Expenses...</h2>
        </div>
      )}
      
      {step === 'SUCCESS' && (
        <div style={{ textAlign: 'center', padding: '80px 40px' }}>
          <div style={{ width: '64px', height: '64px', background: 'var(--green)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '24px' }}>✓</div>
          <h2>Import Complete!</h2>
          <p style={{ color: 'var(--text3)', marginBottom: '32px' }}>All valid expenses have been cleanly added to your group ledger.</p>
          <button className="btn btn-primary" onClick={() => {
            setStep('UPLOAD');
            setSelectedGroupId('');
            setBatchId(null);
            setBatchData(null);
          }}>Import Another File</button>
        </div>
      )}
    </div>
  );
}
