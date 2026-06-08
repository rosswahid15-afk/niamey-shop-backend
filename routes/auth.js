const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const db = require('../config/db');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Trop de tentatives. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerRules = [
  body('nom').trim().isLength({ min: 2, max: 100 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('mot_de_passe').isLength({ min: 8 })
    .matches(/[A-Z]/).withMessage('Doit contenir une majuscule')
    .matches(/[0-9]/).withMessage('Doit contenir un chiffre'),
];

const loginRules = [
  body('email').isEmail().normalizeEmail(),
  body('mot_de_passe').notEmpty().isLength({ max: 128 }),
];

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: errors.array()[0].msg });
  next();
}

router.post('/register', authLimiter, registerRules, validate, async (req, res) => {
  const { nom, email, mot_de_passe } = req.body;
  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      await new Promise(r => setTimeout(r, 300));
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }
    const hash = await bcrypt.hash(mot_de_passe, 12);
    await db.query('INSERT INTO users (nom, email, mot_de_passe) VALUES (?, ?, ?)', [nom, email, hash]);
    res.status(201).json({ message: 'Compte créé avec succès' });
  } catch (err) {
    console.error('Erreur register:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/login', authLimiter, loginRules, validate, async (req, res) => {
  const { email, mot_de_passe } = req.body;
  try {
    const [rows] = await db.query('SELECT id, nom, mot_de_passe, role FROM users WHERE email = ?', [email]);
    const hash = rows[0]?.mot_de_passe || '$2b$12$invalidhashpaddingtomatchtime00';
    const match = await bcrypt.compare(mot_de_passe, hash);
    if (!rows[0] || !match) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }
    const user = rows[0];
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h', issuer: 'niamey-shop', algorithm: 'HS256' }
    );
    res.json({ token, nom: user.nom, role: user.role });
  } catch (err) {
    console.error('Erreur login:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
