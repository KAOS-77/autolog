const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const router = express.Router();

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '7d';

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role || 'owner' },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, phone, cpf } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });
    }

    if (!full_name || !String(full_name).trim()) {
      return res.status(400).json({ error: 'Nome completo é obrigatório' });
    }

    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ error: 'Telefone é obrigatório' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

    if (existing) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const fullNameClean = String(full_name).trim();
    const phoneClean = String(phone).trim();
    const cpfClean = cpf ? String(cpf).trim() : null;

    const result = db.prepare(
      "INSERT INTO users (email, password_hash, role, full_name, phone, cpf) VALUES (?, ?, 'owner', ?, ?, ?)"
    ).run(email, passwordHash, fullNameClean, phoneClean, cpfClean);

    const user = {
      id: result.lastInsertRowid,
      email,
      role: 'owner',
      full_name: fullNameClean,
      phone: phoneClean
    };
    const token = generateToken(user);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Erro no registro:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/auth/register-shop
router.post('/register-shop', async (req, res) => {
  try {
    const { email, password, shopName, cnpj, address, phone, description } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });
    }

    if (!shopName || !shopName.trim()) {
      return res.status(400).json({ error: 'Nome da oficina é obrigatório' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

    if (existing) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Transação para garantir atomicidade entre user + shop_profile.
    const createShop = db.transaction(() => {
      const userResult = db.prepare(
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'shop')"
      ).run(email, passwordHash);

      const userId = userResult.lastInsertRowid;

      const shopResult = db.prepare(
        `INSERT INTO shop_profiles (user_id, shop_name, cnpj, address, phone, description)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        userId,
        shopName.trim(),
        cnpj || null,
        address || null,
        phone || null,
        description || null
      );

      const shop = db.prepare('SELECT * FROM shop_profiles WHERE id = ?').get(shopResult.lastInsertRowid);
      return { userId, shop };
    });

    const { userId, shop } = createShop();

    const user = { id: userId, email, role: 'shop' };
    const token = generateToken(user);

    res.status(201).json({ token, user, shop });
  } catch (err) {
    console.error('Erro no cadastro de oficina:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const role = user.role || 'owner';
    const token = generateToken({ id: user.id, email: user.email, role });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role,
        full_name: user.full_name || null,
        phone: user.phone || null
      }
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
