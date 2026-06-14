import React, { useState, useEffect } from 'react';
import { getAllBatches } from '../api';
import { useNavigate } from 'react-router-dom';

export default function ImportHistory() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    try {
      const data = await getAllBatches();
      setBatches(data.batches || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading history...</div>;

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginBottom: '24px' }}>
        <div className="screen-label" style={{ marginBottom: 0 }}>Import History & Anomalies</div>
        <button className="btn btn-primary" onClick={() => navigate('/import')}>+ New Import</button>
      </div>

      {batches.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No Imports Yet</div>
          <p className="text-muted" style={{ marginBottom: '24px' }}>You haven't uploaded any expense CSV files.</p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Date Uploaded</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Anomalies Remaining</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id}>
                  <td className="mono text-sm">{new Date(b.createdAt).toLocaleString()}</td>
                  <td>
                    {b.status === 'COMMITTED' ? (
                      <span className="badge badge-green">Committed</span>
                    ) : (
                      <span className="badge badge-amber">Pending Review</span>
                    )}
                  </td>
                  <td>{b.resolvedRows} / {b.totalRows}</td>
                  <td>
                    {b.anomalyCount > 0 ? (
                      <span className="badge badge-red">{b.anomalyCount} left</span>
                    ) : (
                      <span className="badge badge-slate">None</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {b.status === 'COMMITTED' ? (
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/groups/${b.groupId}/import-report/${b.id}`)}>View Report</button>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => navigate(`/groups/${b.groupId}/import/${b.id}`)}>Resolve Anomalies</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
