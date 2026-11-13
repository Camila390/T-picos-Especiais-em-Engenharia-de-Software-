
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Consultar eventos
app.get('/events', (req, res) =>
  axios.get('http://event-service:3001/')
    .then(r => res.json(r.data))
    .catch(() => res.json([{ id: 1, name: 'Show em Picos' }]))
);

// Comprar ingresso
app.post('/tickets/buy', (req, res) =>
  axios.post('http://ticket-service:3002/buy', req.body)
    .then(r => res.json(r.data))
    .catch(error => res.status(error.response?.status || 502)
      .json(error.response?.data || { error: 'Erro ao comprar ingresso' }))
);

// Consultar ingressos pelo usuário
app.get('/tickets/user/:name', (req, res) =>
  axios.get(`http://ticket-service:3002/user/${encodeURIComponent(req.params.name)}`)
    .then(r => res.json(r.data))
    .catch(() => res.status(502).json({ error: 'Erro ao consultar ingressos' }))
);

// Cancelar ingresso
app.patch('/tickets/cancel/:id', (req, res) =>
  axios.patch(`http://ticket-service:3002/cancel/${req.params.id}`)
    .then(r => res.json(r.data))
    .catch(error => res.status(error.response?.status || 502)
      .json(error.response?.data || { error: 'Erro ao cancelar ingresso' }))
);

// Consultar histórico do ingresso
app.get('/tickets/:id/history', (req, res) =>
  axios.get(`http://ticket-service:3002/history/${req.params.id}`)
    .then(r => res.json(r.data))
    .catch(error => res.status(error.response?.status || 502)
      .json(error.response?.data || { error: 'Erro ao consultar histórico' }))
);
// Validar ingresso pelo QR Code
app.post('/tickets/validate', (req, res) =>
  axios.post('http://ticket-service:3002/validate', req.body)
    .then(r => res.json(r.data))
    .catch(error => res.status(error.response?.status || 502)
      .json(error.response?.data || { error: 'Erro ao validar ingresso' }))
);

app.listen(3000, () => console.log('API Gateway OK na 3000'));
