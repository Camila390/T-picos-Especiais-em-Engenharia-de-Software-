
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

  // Atualiza ingressos antigos sem status
  await pool.query(`
    ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo'
  `);

  await pool.query(`
    UPDATE tickets SET status = 'ativo'
    WHERE status IS NULL
  `);
}

init().then(() => console.log('ticket-service OK com Postgres'));

app.get('/', async (_, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tickets');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao consultar ingressos' });
  }
});

// Comprar ingresso
app.post('/buy', async (req, res) => {
  try {
    const { eventId, user } = req.body;

    if (!eventId || !user) {
      return res.status(400).json({
        error: 'Informe o evento e o usuário'
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO tickets (eventid, "user", status)
       VALUES ($1, $2, 'ativo') RETURNING *`,
      [eventId, user]
    );

    res.status(201).json({
      msg: 'Ingresso salvo no Postgres!',
      ticket: rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao comprar ingresso' });
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

// Cancelar ingresso pelo ID
app.patch('/cancel/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE tickets
       SET status = 'cancelado'
       WHERE id = $1 AND status = 'ativo'
       RETURNING *`,
      [req.params.id]
    );

    if (rows.length === 0) {
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

    res.json({
      msg: 'Ingresso cancelado com sucesso!',
      ticket: rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao cancelar ingresso' });
  }
});

app.listen(3002, () => console.log('Ticket Service na porta 3002'));
