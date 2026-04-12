const jwt = require('jsonwebtoken');
const { getDb } = require('./db');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    req.userEmail = payload.email;

    // Fallback para tokens antigos sem `role` no payload: consulta ao banco.
    if (payload.role) {
      req.userRole = payload.role;
    } else {
      try {
        const row = getDb().prepare('SELECT role FROM users WHERE id = ?').get(payload.userId);
        req.userRole = row?.role || 'owner';
      } catch {
        req.userRole = 'owner';
      }
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Não autorizado' });
  }
}

/**
 * Retorna um middleware Express que exige que o usuário autenticado tenha o role informado.
 * Deve ser encadeado APÓS o authMiddleware principal.
 */
function requireRole(role) {
  return function (req, res, next) {
    if (req.userRole !== role) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}

module.exports = authMiddleware;
module.exports.requireRole = requireRole;
