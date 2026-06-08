const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const db = require('../config/db');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: errors.array()[0].msg });
  next();
}

const produitRules = [
  body('nom').trim().isLength({ min: 2, max: 150 }).escape(),
  body('description').optional().trim().isLength({ max: 1000 }).escape(),
  body('prix').isFloat({ min: 0.01, max: 10000000 }),
  body('stock').isInt({ min: 0, max: 100000 }),
  body('categorie').optional().trim().isIn(['femme','homme','enfant','accessoires']),
  body('image_url').optional().isURL({ protocols: ['https'] }),
];

router.get('/', async (req, res) => {
  try {
    const [produits] = await db.query('SELECT id, nom, description, prix, prix_cfa, stock, image_url, categorie, created_at FROM produits ORDER BY created_at DESC');
    res.json(produits);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/:id', param('id').isInt({ min: 1 }), validate, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM produits WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Produit introuvable' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/', authMiddleware, adminMiddleware, produitRules, validate, async (req, res) => {
  const { nom, description, prix, stock, image_url, categorie } = req.body;
  const prix_cfa = Math.round(Number(prix) * 655.957);
  try {
    const [result] = await db.query(
      'INSERT INTO produits (nom, description, prix, prix_cfa, stock, image_url, categorie) VALUES (?,?,?,?,?,?,?)',
      [nom, description || null, prix, prix_cfa, stock, image_url || null, categorie || null]
    );
    res.status(201).json({ message: 'Produit ajouté', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.put('/:id', authMiddleware, adminMiddleware, param('id').isInt({ min: 1 }), produitRules, validate, async (req, res) => {
  const { nom, description, prix, stock, image_url, categorie } = req.body;
  const prix_cfa = Math.round(Number(prix) * 655.957);
  try {
    const [result] = await db.query(
      'UPDATE produits SET nom=?, description=?, prix=?, prix_cfa=?, stock=?, image_url=?, categorie=? WHERE id=?',
      [nom, description || null, prix, prix_cfa, stock, image_url || null, categorie || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Produit introuvable' });
    res.json({ message: 'Produit mis à jour' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.delete('/:id', authMiddleware, adminMiddleware, param('id').isInt({ min: 1 }), validate, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM produits WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Produit introuvable' });
    res.json({ message: 'Produit supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
