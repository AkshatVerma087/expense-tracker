import React from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Groups from './pages/Groups';
import Dashboard from './pages/Dashboard';
import Import from './pages/Import';
import Report from './pages/Report';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  return children;
}

function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getInitials = (name) => {
    if (!name) return 'US';
    return name.substring(0, 1).toUpperCase();
  };

  return (
    <div>
      <nav className="topnav">
        <div className="topnav-inner">
          <div className="logo">
            <div className="logo-mark">S</div>
            SplitEase
          </div>
          <div className="nav-links">
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>Dashboard</NavLink>
            <NavLink to="/groups" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Groups</NavLink>
            <NavLink to="/import" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Import CSV</NavLink>
          </div>
          <div className="flex items-center gap-8">
            <button className="btn btn-outline btn-sm" onClick={handleLogout}>Logout</button>
            <div className="nav-avatar" title={user?.name || "User"}>{getInitials(user?.name)}</div>
          </div>
        </div>
      </nav>
      
      <main className="page-wrap">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route 
        path="/*" 
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/groups" element={<Groups />} />
                <Route path="/groups/:groupId/import-report/:batchId" element={<Report />} />
                <Route path="/import" element={<Import />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
}
