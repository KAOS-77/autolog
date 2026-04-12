const express = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');

const router = express.Router();

/**
 * POST /api/invitations
 * Oficina convida um proprietário (por email).
 */
router.post('/', requireRole('shop'), (req, res) => {
  try {
    const { ownerEmail } = req.body;

    if (typeof ownerEmail !== 'string' || !ownerEmail.trim()) {
      return res.status(400).json({ error: 'ownerEmail é obrigatório' });
    }

    const email = ownerEmail.trim().toLowerCase();
    const db = getDb();

    // Tenta localizar o owner cadastrado
    const ownerRow = db.prepare(
      `SELECT id FROM users WHERE LOWER(email) = ? AND role = 'owner'`
    ).get(email);

    const ownerUserId = ownerRow ? ownerRow.id : null;

    if (ownerUserId !== null) {
      // Verificar convite existente para este par shop+owner
      const existing = db.prepare(
        `SELECT id, status FROM shop_invitations
         WHERE shop_user_id = ? AND owner_user_id = ?`
      ).get(req.userId, ownerUserId);

      if (existing) {
        if (existing.status === 'accepted') {
          return res.status(409).json({ error: 'Proprietário já vinculado' });
        }
        if (existing.status === 'pending') {
          return res.status(409).json({ error: 'Convite já enviado e aguardando resposta' });
        }
        // rejected/revoked — reutilizar o registro
        db.prepare(
          `UPDATE shop_invitations
           SET status = 'pending',
               resolved_at = NULL,
               owner_email = ?,
               created_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).run(email, existing.id);

        const updated = db.prepare(
          `SELECT id, owner_email, status, created_at FROM shop_invitations WHERE id = ?`
        ).get(existing.id);

        return res.status(201).json({
          id: updated.id,
          ownerEmail: updated.owner_email,
          status: updated.status,
          createdAt: updated.created_at
        });
      }
    }

    // Inserir novo convite
    const info = db.prepare(
      `INSERT INTO shop_invitations (shop_user_id, owner_email, owner_user_id, status)
       VALUES (?, ?, ?, 'pending')`
    ).run(req.userId, email, ownerUserId);

    const created = db.prepare(
      `SELECT id, owner_email, status, created_at FROM shop_invitations WHERE id = ?`
    ).get(info.lastInsertRowid);

    return res.status(201).json({
      id: created.id,
      ownerEmail: created.owner_email,
      status: created.status,
      createdAt: created.created_at
    });
  } catch (err) {
    console.error('Erro ao criar convite:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * GET /api/invitations/sent
 * Oficina lista convites enviados.
 */
router.get('/sent', requireRole('shop'), (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT i.id, i.owner_email, i.owner_user_id, i.status,
              i.created_at, i.resolved_at, sp.shop_name
         FROM shop_invitations i
         LEFT JOIN shop_profiles sp ON sp.user_id = i.shop_user_id
        WHERE i.shop_user_id = ?
        ORDER BY i.created_at DESC`
    ).all(req.userId);

    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar convites enviados:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * GET /api/invitations/received
 * Proprietário lista convites recebidos.
 */
router.get('/received', requireRole('owner'), (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT i.id, i.status, i.created_at, i.resolved_at,
              sp.shop_name, sp.phone, sp.address
         FROM shop_invitations i
         LEFT JOIN shop_profiles sp ON sp.user_id = i.shop_user_id
        WHERE i.owner_user_id = ?
        ORDER BY i.created_at DESC`
    ).all(req.userId);

    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar convites recebidos:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * Helper: resolve o convite (accept/reject) com checagens de posse e status.
 */
function resolveInvitation(req, res, newStatus) {
  const db = getDb();
  const invitationId = Number(req.params.id);

  if (!Number.isInteger(invitationId)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const invitation = db.prepare(
    `SELECT id, owner_user_id, status FROM shop_invitations WHERE id = ?`
  ).get(invitationId);

  if (!invitation) {
    return res.status(404).json({ error: 'Convite não encontrado' });
  }
  if (invitation.owner_user_id !== req.userId) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  if (invitation.status !== 'pending') {
    return res.status(400).json({ error: 'Convite não está pendente' });
  }

  db.prepare(
    `UPDATE shop_invitations
        SET status = ?, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).run(newStatus, invitationId);

  res.json({ id: invitationId, status: newStatus });
}

/**
 * PATCH /api/invitations/:id/accept
 */
router.patch('/:id/accept', requireRole('owner'), (req, res) => {
  try {
    resolveInvitation(req, res, 'accepted');
  } catch (err) {
    console.error('Erro ao aceitar convite:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * PATCH /api/invitations/:id/reject
 */
router.patch('/:id/reject', requireRole('owner'), (req, res) => {
  try {
    resolveInvitation(req, res, 'rejected');
  } catch (err) {
    console.error('Erro ao rejeitar convite:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * DELETE /api/invitations/:id
 * Revoga o convite (qualquer uma das partes). Mantém o registro para histórico.
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const invitationId = Number(req.params.id);

    if (!Number.isInteger(invitationId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const invitation = db.prepare(
      `SELECT id, shop_user_id, owner_user_id FROM shop_invitations WHERE id = ?`
    ).get(invitationId);

    if (!invitation) {
      return res.status(404).json({ error: 'Convite não encontrado' });
    }

    const isShop = invitation.shop_user_id === req.userId;
    const isOwner = invitation.owner_user_id === req.userId;

    if (!isShop && !isOwner) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    db.prepare(
      `UPDATE shop_invitations
          SET status = 'revoked', resolved_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).run(invitationId);

    res.json({ id: invitationId, status: 'revoked' });
  } catch (err) {
    console.error('Erro ao revogar convite:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
