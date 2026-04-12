const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

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

// GET /api/records?vehicleId=:id
router.get('/', (req, res) => {
  try {
    const { vehicleId } = req.query;
    const db = getDb();

    let records;

    if (vehicleId) {
      // Verify vehicle belongs to user
      const vehicle = db.prepare(
        'SELECT id FROM vehicles WHERE id = ? AND user_id = ?'
      ).get(vehicleId, req.userId);

      if (!vehicle) {
        return res.status(404).json({ error: 'Veículo não encontrado' });
      }

      records = db.prepare(
        'SELECT * FROM records WHERE vehicle_id = ? AND user_id = ? ORDER BY date DESC'
      ).all(vehicleId, req.userId);
    } else {
      records = db.prepare(
        'SELECT * FROM records WHERE user_id = ? ORDER BY date DESC'
      ).all(req.userId);
    }

    res.json(records.map(serializeRecord));
  } catch (err) {
    console.error('Erro ao listar registros:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/records
router.post('/', (req, res) => {
  try {
    const {
      id, vehicleId, date, mileage, serviceTypes,
      notes, partsUsed, partsCost, laborCost, taxAmount, totalCost,
      shopName, shopPhone, shopAddr, techName,
      nextService, warranty, addedAt
    } = req.body;

    if (!id || !vehicleId) {
      return res.status(400).json({ error: 'ID e vehicleId são obrigatórios' });
    }

    const db = getDb();

    // Verify vehicle belongs to user
    const vehicle = db.prepare(
      'SELECT id FROM vehicles WHERE id = ? AND user_id = ?'
    ).get(vehicleId, req.userId);

    if (!vehicle) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    const serviceTypesJson = Array.isArray(serviceTypes) ? JSON.stringify(serviceTypes) : (serviceTypes ?? '[]');

    db.prepare(`
      INSERT INTO records (
        id, vehicle_id, user_id, date, mileage, service_types,
        notes, parts_used, parts_cost, labor_cost, tax_amount, total_cost,
        shop_name, shop_phone, shop_addr, tech_name,
        next_service, warranty, added_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, vehicleId, req.userId, date ?? null, mileage ?? null, serviceTypesJson,
      notes ?? null, partsUsed ?? null, partsCost ?? null, laborCost ?? null,
      taxAmount ?? null, totalCost ?? null,
      shopName ?? null, shopPhone ?? null, shopAddr ?? null, techName ?? null,
      nextService ?? null, warranty ?? null, addedAt ?? new Date().toISOString()
    );

    const record = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
    res.status(201).json(serializeRecord(record));
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Registro com este ID já existe' });
    }
    console.error('Erro ao criar registro:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// PUT /api/records/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare(
      'SELECT * FROM records WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.userId);

    if (!existing) {
      return res.status(404).json({ error: 'Registro não encontrado' });
    }

    const {
      date, mileage, serviceTypes,
      notes, partsUsed, partsCost, laborCost, taxAmount, totalCost,
      shopName, shopPhone, shopAddr, techName,
      nextService, warranty
    } = req.body;

    const serviceTypesJson = serviceTypes !== undefined
      ? (Array.isArray(serviceTypes) ? JSON.stringify(serviceTypes) : serviceTypes)
      : null;

    db.prepare(`
      UPDATE records SET
        date = COALESCE(?, date),
        mileage = COALESCE(?, mileage),
        service_types = COALESCE(?, service_types),
        notes = COALESCE(?, notes),
        parts_used = COALESCE(?, parts_used),
        parts_cost = COALESCE(?, parts_cost),
        labor_cost = COALESCE(?, labor_cost),
        tax_amount = COALESCE(?, tax_amount),
        total_cost = COALESCE(?, total_cost),
        shop_name = COALESCE(?, shop_name),
        shop_phone = COALESCE(?, shop_phone),
        shop_addr = COALESCE(?, shop_addr),
        tech_name = COALESCE(?, tech_name),
        next_service = COALESCE(?, next_service),
        warranty = COALESCE(?, warranty),
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(
      date ?? null, mileage ?? null, serviceTypesJson,
      notes ?? null, partsUsed ?? null, partsCost ?? null, laborCost ?? null,
      taxAmount ?? null, totalCost ?? null,
      shopName ?? null, shopPhone ?? null, shopAddr ?? null, techName ?? null,
      nextService ?? null, warranty ?? null,
      req.params.id, req.userId
    );

    const record = db.prepare('SELECT * FROM records WHERE id = ?').get(req.params.id);
    res.json(serializeRecord(record));
  } catch (err) {
    console.error('Erro ao atualizar registro:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// DELETE /api/records/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare(
      'DELETE FROM records WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Registro não encontrado' });
    }

    res.status(204).end();
  } catch (err) {
    console.error('Erro ao deletar registro:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
