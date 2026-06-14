import * as authService from './auth.service.js';

async function register(req, res) {
  try {
    const { email, password, name } = req.body;
    const user = await authService.register(email, password, name);
    res.status(201).json({ message: 'User registered successfully. Please login.', user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    const { user, accessToken, refreshToken } = await authService.login(email, password);
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.status(200).json({ accessToken, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
}

async function googleAuth(req, res) {
  try {
    const { idToken } = req.body;
    const { user, accessToken, refreshToken } = await authService.googleAuth(idToken);
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.status(200).json({ accessToken, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
}

async function refresh(req, res) {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) throw new Error('No refresh token provided');
    
    const { accessToken, newRefreshToken } = await authService.refresh(refreshToken);
    
    if (newRefreshToken) {
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    }
    
    res.status(200).json({ accessToken });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
}

async function logout(req, res) {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    res.clearCookie('refreshToken');
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export {
  register,
  login,
  googleAuth,
  refresh,
  logout
};
