
const express = require('express');
const { Pool } = require('pg');

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

// Comprar ingresso e registrar histórico
app.post('/buy', async (req, res) => {
  const client = await pool.connect();

  try {
    const { eventId, user } = req.body;

    if (!eventId || !user) {
      return res.status(400).json({
        error: 'Informe o evento e o usuário'
      });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO tickets (eventid, "user", status)
       VALUES ($1, $2, 'ativo') RETURNING *`,
      [eventId, user]
    );

    await client.query(
      `INSERT INTO ticket_history (ticket_id, action)
       VALUES ($1, 'compra')`,
      [rows[0].id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      msg: 'Ingresso comprado e histórico registrado!',
      ticket: rows[0]
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

// Cancelar ingresso e registrar histórico
app.patch('/cancel/:id', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE tickets
       SET status = 'cancelado'
       WHERE id = $1 AND status = 'ativo'
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
      msg: 'Ingresso cancelado e histórico registrado!',
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

// Consultar histórico de um ingresso
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
