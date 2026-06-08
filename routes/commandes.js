const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const authMiddleware = require('../middleware/auth');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: errors.array()[0].msg });
  next();
}

const commandeRules = [
  body('items').isArray({ min: 1, max: 50 }),
  body('items.*.produit_id').isInt({ min: 1 }),
  body('items.*.quantite').isInt({ min: 1, max: 99 }),
  body('items.*.prix_unitaire').isFloat({ min: 0 }),
];

router.post('/', authMiddleware, commandeRules, validate, async (req, res) => {
  const { items } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const item of items) {
      const [rows] = await conn.query('SELECT prix_cfa, stock FROM produits WHERE id = ? FOR UPDATE', [item.produit_id]);
      if (!rows[0]) throw new Error(`Produit #${item.produit_id} introuvable`);
      if (rows[0].stock < item.quantite) throw new Error(`Stock insuffisant pour le produit #${item.produit_id}`);
      item._prix_reel = Number(rows[0].prix_cfa);
    }
    const total = items.reduce((s, i) => s + i.quantite * i._prix_reel, 0);
    const [cmdResult] = await conn.query('INSERT INTO commandes (user_id, total) VALUES (?, ?)', [req.user.id, total]);
    const commande_id = cmdResult.insertId;
    for (const item of items) {
      await conn.query('INSERT INTO commande_items (commande_id, produit_id, quantite, prix_unitaire) VALUES (?,?,?,?)', [commande_id, item.produit_id, item.quantite, item._prix_reel]);
      await conn.query('UPDATE produits SET stock = stock - ? WHERE id = ?', [item.quantite, item.produit_id]);
    }
    await conn.commit();
    res.status(201).json({ message: 'Commande confirmée', commande_id, total });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ message: err.message || 'Erreur lors de la commande' });
  } finally {
    conn.release();
  }
});

router.get('/mes-commandes', authMiddleware, async (req, res) => {
  try {
    const [commandes] = await db.query(
      `SELECT c.id, c.total, c.statut, c.created_at,
              JSON_ARRAYAGG(JSON_OBJECT('produit', p.nom, 'quantite', ci.quantite, 'prix', ci.prix_unitaire)) as items
       FROM commandes c
       LEFT JOIN commande_items ci ON ci.commande_id = c.id
       LEFT JOIN produits p ON p.id = ci.produit_id
       WHERE c.user_id = ?
       GROUP BY c.id ORDER BY c.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(commandes);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
