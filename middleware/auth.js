const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentification requise' });
  }
  const token = authHeader.split(' ')[1];
  if (!token || token.length > 512) {
    return res.status(401).json({ message: 'Token invalide' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'niamey-shop',
    });
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expirée, reconnectez-vous' });
    }
    return res.status(403).json({ message: 'Token invalide ou falsifié' });
  }
};
