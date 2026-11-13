
const express = require('express');
const { Pool } = require('pg');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function init() {
  await new Promise(r => setTimeout(r, 4000));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      eventid INT,
      "user" TEXT,
      status TEXT DEFAULT 'ativo'
    )
  `);

  await pool.query(`
    ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo'
  `);

  await pool.query(`
    ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS qr_token TEXT UNIQUE
  `);

  await pool.query(`
    ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS used_at TIMESTAMP
  `);

  await pool.query(`
    UPDATE tickets SET status = 'ativo'
    WHERE status IS NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_history (
      id SERIAL PRIMARY KEY,
      ticket_id INT NOT NULL,
      action TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

init()
  .then(() => console.log('ticket-service OK com Postgres'))
  .catch(error => console.error('Erro ao iniciar:', error));

// Consultar todos os ingressos
app.get('/', async (_, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tickets');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar ingressos' });
  }
});

// Comprar ingresso e gerar QR Code
app.post('/buy', async (req, res) => {
  const client = await pool.connect();

  try {
    const { eventId, user } = req.body;

    if (!eventId || !user) {
      return res.status(400).json({
        error: 'Informe o evento e o usuário'
      });
    }

    const qrToken = crypto.randomUUID();
    const qrImage = await QRCode.toDataURL(qrToken);

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO tickets (eventid, "user", status, qr_token)
       VALUES ($1, $2, 'ativo', $3)
       RETURNING *`,
      [eventId, user, qrToken]
    );

    await client.query(
      `INSERT INTO ticket_history (ticket_id, action)
       VALUES ($1, 'compra')`,
      [rows[0].id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      msg: 'Ingresso comprado e QR Code gerado!',
      ticket: rows[0],
      qrCode: qrImage
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Erro ao comprar ingresso' });
  } finally {
    client.release();
  }
});

// Consultar ingressos pelo usuário
app.get('/user/:name', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM tickets WHERE "user" = $1',
      [req.params.name]
    );

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar ingressos' });
  }
});

// Cancelar ingresso
app.patch('/cancel/:id', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE tickets
       SET status = 'cancelado'
       WHERE id = $1
       AND status = 'ativo'
       AND used_at IS NULL
       RETURNING *`,
      [req.params.id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');

      const ticket = await pool.query(
        'SELECT * FROM tickets WHERE id = $1',
        [req.params.id]
      );

      if (ticket.rows.length === 0) {
        return res.status(404).json({
          error: 'Ingresso não encontrado'
        });
      }

      if (ticket.rows[0].used_at !== null) {
        return res.status(409).json({
          error: 'Ingresso já foi utilizado'
        });
      }

      return res.status(409).json({
        error: 'Ingresso já está cancelado'
      });
    }

    await client.query(
      `INSERT INTO ticket_history (ticket_id, action)
       VALUES ($1, 'cancelamento')`,
      [rows[0].id]
    );

    await client.query('COMMIT');

    res.json({
      msg: 'Ingresso cancelado com sucesso!',
      ticket: rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Erro ao cancelar ingresso' });
  } finally {
    client.release();
  }
});

// Validar ingresso pelo QR Code
app.post('/validate', async (req, res) => {
  const client = await pool.connect();

  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        error: 'Informe o código do QR Code'
      });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE tickets
       SET used_at = CURRENT_TIMESTAMP
       WHERE qr_token = $1
       AND status = 'ativo'
       AND used_at IS NULL
       RETURNING id, eventid, "user", status, used_at`,
      [code]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');

      const ticket = await pool.query(
        'SELECT * FROM tickets WHERE qr_token = $1',
        [code]
      );

      if (ticket.rows.length === 0) {
        return res.status(404).json({
          error: 'QR Code inválido'
        });
      }

      if (ticket.rows[0].status === 'cancelado') {
        return res.status(409).json({
          error: 'Ingresso cancelado. Entrada não permitida.'
        });
      }

      return res.status(409).json({
        error: 'Ingresso já foi utilizado anteriormente.'
      });
    }

    await client.query(
      `INSERT INTO ticket_history (ticket_id, action)
       VALUES ($1, 'validacao')`,
      [rows[0].id]
    );

    await client.query('COMMIT');

    res.json({
      msg: 'Ingresso validado! Entrada autorizada.',
      ticket: rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Erro ao validar ingresso' });
  } finally {
    client.release();
  }
});

// Consultar histórico
app.get('/history/:ticketId', async (req, res) => {
  try {
    const ticketId = Number(req.params.ticketId);

    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({
        error: 'ID de ingresso inválido'
      });
    }

    const { rows } = await pool.query(
      `SELECT * FROM ticket_history
       WHERE ticket_id = $1
       ORDER BY created_at DESC`,
      [ticketId]
    );

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar histórico' });
  }
});

app.listen(3002, () => {
  console.log('Ticket Service na porta 3002');
});
