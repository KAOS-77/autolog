const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// GET /api/vehicles
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const vehicles = db.prepare(
      'SELECT * FROM vehicles WHERE user_id = ? ORDER BY added_at DESC'
    ).all(req.userId);

    res.json(vehicles);
  } catch (err) {
    console.error('Erro ao listar veículos:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/vehicles
router.post('/', (req, res) => {
  try {
    const {
      id, make, model, year, trim,
      ownerName, ownerPhone, ownerEmail,
      mileage, notes, photo, addedAt
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID do veículo é obrigatório' });
    }

    const db = getDb();

    db.prepare(`
      INSERT INTO vehicles (id, user_id, make, model, year, trim, owner_name, owner_phone, owner_email, mileage, notes, photo, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.userId, make ?? null, model ?? null, year ?? null, trim ?? null,
      ownerName ?? null, ownerPhone ?? null, ownerEmail ?? null,
      mileage ?? null, notes ?? null, photo ?? null, addedAt ?? new Date().toISOString()
    );

    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    res.status(201).json(vehicle);
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Veículo com este ID já existe' });
    }
    console.error('Erro ao criar veículo:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// PUT /api/vehicles/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare(
      'SELECT * FROM vehicles WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.userId);

    if (!existing) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    const {
      make, model, year, trim,
      ownerName, ownerPhone, ownerEmail,
      mileage, notes, photo
    } = req.body;

    db.prepare(`
      UPDATE vehicles SET
        make = COALESCE(?, make),
        model = COALESCE(?, model),
        year = COALESCE(?, year),
        trim = COALESCE(?, trim),
        owner_name = COALESCE(?, owner_name),
        owner_phone = COALESCE(?, owner_phone),
        owner_email = COALESCE(?, owner_email),
        mileage = COALESCE(?, mileage),
        notes = COALESCE(?, notes),
        photo = COALESCE(?, photo),
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(
      make ?? null, model ?? null, year ?? null, trim ?? null,
      ownerName ?? null, ownerPhone ?? null, ownerEmail ?? null,
      mileage ?? null, notes ?? null, photo ?? null,
      req.params.id, req.userId
    );

    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
    res.json(vehicle);
  } catch (err) {
    console.error('Erro ao atualizar veículo:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// DELETE /api/vehicles/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare(
      'DELETE FROM vehicles WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    res.status(204).end();
  } catch (err) {
    console.error('Erro ao deletar veículo:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
