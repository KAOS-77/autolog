const express = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../auth');

const router = express.Router();

// Todas as rotas desta router exigem role 'shop'
router.use(requireRole('shop'));

function serializeRecord(record) {
  if (record && typeof record.service_types === 'string') {
    try {
      record.service_types = JSON.parse(record.service_types);
    } catch {
      record.service_types = [];
    }
  }
  return record;
}

// GET /api/shops/me — perfil da oficina autenticada
router.get('/me', (req, res) => {
  try {
    const db = getDb();
    const profile = db.prepare(
      'SELECT * FROM shop_profiles WHERE user_id = ?'
    ).get(req.userId);

    if (!profile) {
      return res.status(404).json({ error: 'Perfil de oficina não encontrado' });
    }

    res.json(profile);
  } catch (err) {
    console.error('Erro ao buscar perfil da oficina:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// PUT /api/shops/me — atualiza perfil da oficina
router.put('/me', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare(
      'SELECT * FROM shop_profiles WHERE user_id = ?'
    ).get(req.userId);

    if (!existing) {
      return res.status(404).json({ error: 'Perfil de oficina não encontrado' });
    }

    const { shop_name, cnpj, address, phone, description } = req.body;

    db.prepare(`
      UPDATE shop_profiles SET
        shop_name   = COALESCE(?, shop_name),
        cnpj        = COALESCE(?, cnpj),
        address     = COALESCE(?, address),
        phone       = COALESCE(?, phone),
        description = COALESCE(?, description)
      WHERE user_id = ?
    `).run(
      shop_name ?? null,
      cnpj ?? null,
      address ?? null,
      phone ?? null,
      description ?? null,
      req.userId
    );

    const updated = db.prepare(
      'SELECT * FROM shop_profiles WHERE user_id = ?'
    ).get(req.userId);

    res.json(updated);
  } catch (err) {
    console.error('Erro ao atualizar perfil da oficina:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /api/shops/vehicles?q=TERMO — veículos de owners com vínculo aceito
router.get('/vehicles', (req, res) => {
  try {
    const db = getDb();
    const q = (req.query.q || '').toString().trim();

    const baseSelect = `
      SELECT
        v.id          AS id,
        v.make        AS make,
        v.model       AS model,
        v.year        AS year,
        v.trim        AS trim,
        v.owner_name  AS ownerName
      FROM vehicles v
      INNER JOIN shop_invitations si
              ON si.owner_user_id = v.user_id
             AND si.shop_user_id  = ?
             AND si.status        = 'accepted'
    `;

    let rows;
    if (q) {
      const like = `%${q}%`;
      rows = db.prepare(`
        ${baseSelect}
        WHERE v.make LIKE ?
           OR v.model LIKE ?
           OR v.year LIKE ?
           OR v.trim LIKE ?
           OR v.owner_name LIKE ?
        ORDER BY v.added_at DESC
        LIMIT 50
      `).all(req.userId, like, like, like, like, like);
    } else {
      rows = db.prepare(`
        ${baseSelect}
        ORDER BY v.added_at DESC
        LIMIT 50
      `).all(req.userId);
    }

    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar veículos autorizados:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/shops/records — oficina cria registro para veículo autorizado
router.post('/records', (req, res) => {
  try {
    const {
      vehicleId, date, mileage, serviceTypes,
      notes, partsUsed, partsCost, laborCost, taxAmount, totalCost,
      shopName, shopPhone, shopAddr, techName,
      nextService, warranty
    } = req.body;

    if (!vehicleId) {
      return res.status(400).json({ error: 'vehicleId é obrigatório' });
    }

    const db = getDb();

    // a. Buscar veículo e dono
    const vehicle = db.prepare(
      'SELECT id, user_id FROM vehicles WHERE id = ?'
    ).get(vehicleId);

    if (!vehicle) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // b. Checar vínculo aceito
    const invite = db.prepare(`
      SELECT id FROM shop_invitations
      WHERE shop_user_id = ?
        AND owner_user_id = ?
        AND status = 'accepted'
    `).get(req.userId, vehicle.user_id);

    if (!invite) {
      return res.status(403).json({ error: 'Sem autorização do proprietário para este veículo' });
    }

    const id = Math.random().toString(16).slice(2, 10);
    const serviceTypesJson = Array.isArray(serviceTypes)
      ? JSON.stringify(serviceTypes)
      : (serviceTypes ?? '[]');

    db.prepare(`
      INSERT INTO records (
        id, vehicle_id, user_id, shop_user_id, date, mileage, service_types,
        notes, parts_used, parts_cost, labor_cost, tax_amount, total_cost,
        shop_name, shop_phone, shop_addr, tech_name,
        next_service, warranty, added_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, vehicleId, vehicle.user_id, req.userId,
      date ?? null, mileage ?? null, serviceTypesJson,
      notes ?? null, partsUsed ?? null, partsCost ?? null, laborCost ?? null,
      taxAmount ?? null, totalCost ?? null,
      shopName ?? null, shopPhone ?? null, shopAddr ?? null, techName ?? null,
      nextService ?? null, warranty ?? null,
      new Date().toISOString()
    );

    const record = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
    res.status(201).json(serializeRecord(record));
  } catch (err) {
    console.error('Erro ao criar registro pela oficina:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /api/shops/records — registros criados por esta oficina
router.get('/records', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        r.*,
        v.id         AS vehicleId,
        v.make       AS make,
        v.model      AS model,
        v.year       AS year,
        v.trim       AS trim,
        v.owner_name AS ownerName
      FROM records r
      INNER JOIN vehicles v ON v.id = r.vehicle_id
      WHERE r.shop_user_id = ?
      ORDER BY r.date DESC
    `).all(req.userId);

    res.json(rows.map(serializeRecord));
  } catch (err) {
    console.error('Erro ao listar registros da oficina:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
