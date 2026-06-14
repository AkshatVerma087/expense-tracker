import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getBatchRows } from '../api';

export default function Report() {
  const { groupId, batchId } = useParams();
  const navigate = useNavigate();
  const [batchData, setBatchData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const { batch } = await getBatchRows(groupId, batchId);
        setBatchData(batch);
      } catch (err) {
        console.error("Failed to load report", err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [groupId, batchId]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading Report...</div>;
  if (!batchData) return <div style={{ padding: '40px', textAlign: 'center' }}>Report not found.</div>;

  const totalRows = batchData.rows.length;
  const importedCount = batchData.rows.filter(r => r.status === 'RESOLVED' && r.actionTaken !== 'Import as Settlement').length;
  const settlementCount = batchData.rows.filter(r => r.status === 'RESOLVED' && r.actionTaken === 'Import as Settlement').length;
  const skippedCount = batchData.rows.filter(r => r.status === 'SKIPPED').length;

  const resolvedAnomalies = [];
  const exchangeRates = [];

  batchData.rows.forEach(row => {
    if (row.anomalies) {
      row.anomalies.forEach(anomaly => {
        let resolution = 'Resolved';
        let badgeClass = 'badge-green';

        if (row.status === 'SKIPPED') {
          resolution = 'Skipped';
          badgeClass = 'badge-slate';
        } else if (anomaly.code === 'A-01' || anomaly.code === 'A-15') {
          resolution = 'Auto-corrected';
        } else if (anomaly.code === 'A-04' || anomaly.code === 'A-16') {
          resolution = '→ Settlement table';
          badgeClass = 'badge-sky';
        } else if (anomaly.code === 'A-05') {
          resolution = 'User edited';
        } else if (anomaly.code === 'A-17') {
          resolution = 'Rates fetched';
          
          if (row.parsedData?.exchangeRate) {
            exchangeRates.push({
              date: row.parsedData.date,
              expense: row.parsedData.description,
              rate: row.parsedData.exchangeRate,
              converted: row.parsedData.amount * row.parsedData.exchangeRate
            });
          }
        }

        resolvedAnomalies.push({
          code: anomaly.code,
          severity: anomaly.severity,
          description: anomaly.message,
          resolution,
          badgeClass
        });
      });
    }
  });

  // Deduplicate resolved anomalies to match the UI which groups them
  const uniqueResolutions = [];
  const seenCodes = new Set();
  resolvedAnomalies.forEach(a => {
    if (!seenCodes.has(a.code)) {
      uniqueResolutions.push(a);
      seenCodes.add(a.code);
    }
  });

  return (
    <div>
      <div className="screen-label">7 — Import Report</div>

      <div className="card">
        <div className="flex justify-between items-center" style={{ marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>✅ Import Complete</div>
            <div className="text-sm text-muted">Batch ID: {batchId} · Committed {new Date(batchData.createdAt).toLocaleString()}</div>
          </div>
          <button className="btn btn-outline" onClick={() => navigate(`/groups/${groupId}`)}>Go to Group Ledger →</button>
        </div>

        <div className="grid-4" style={{ marginBottom: '20px' }}>
          <div className="stat-card">
            <div className="stat-label">Rows in file</div>
            <div className="stat-value" style={{ fontSize: '24px', color: 'var(--slate-800)' }}>{totalRows}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Imported</div>
            <div className="stat-value" style={{ fontSize: '24px', color: '#166534' }}>{importedCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">As Settlements</div>
            <div className="stat-value" style={{ fontSize: '24px', color: 'var(--sky)' }}>{settlementCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Skipped</div>
            <div className="stat-value" style={{ fontSize: '24px', color: 'var(--slate-500)' }}>{skippedCount}</div>
          </div>
        </div>

        <div className="grid-2">
          <div>
            <div className="card-title">Anomaly Resolutions</div>
            {uniqueResolutions.length > 0 ? (
              <table className="table">
                <thead>
                  <tr><th>Code</th><th>Description</th><th>Resolution</th></tr>
                </thead>
                <tbody>
                  {uniqueResolutions.map((a, i) => (
                    <tr key={i}>
                      <td><span className={`badge ${a.severity === 'CRITICAL' ? 'badge-red' : a.severity === 'MEDIUM' ? 'badge-amber' : 'badge-slate'}`}>{a.code}</span></td>
                      <td className="text-sm">{a.description.substring(0, 40)}...</td>
                      <td><span className={`badge ${a.badgeClass}`}>{a.resolution}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-muted" style={{ padding: '20px 0' }}>No anomalies were detected in this import.</div>
            )}
          </div>

          <div>
            <div className="card-title">Exchange Rates Applied</div>
            {exchangeRates.length > 0 ? (
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Expense</th><th>Rate (USD/INR)</th><th>Converted</th></tr>
                </thead>
                <tbody>
                  {exchangeRates.map((ex, i) => (
                    <tr key={i}>
                      <td className="mono text-sm">{ex.date}</td>
                      <td className="text-sm">{ex.expense}</td>
                      <td className="mono">{ex.rate.toFixed(4)}</td>
                      <td className="mono amount-negative">₹{ex.converted.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-muted" style={{ padding: '20px 0', marginBottom: '20px' }}>No foreign currency conversions were required.</div>
            )}

            <div className="divider"></div>

            <div className="alert alert-success">
              <span>✓</span>
              <div>
                <div style={{ fontWeight: 600, marginBottom: '2px' }}>Audit Trail Saved</div>
                <div style={{ fontSize: '11px' }}>Every decision is permanently logged. View full audit log in Reports → Import History.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
