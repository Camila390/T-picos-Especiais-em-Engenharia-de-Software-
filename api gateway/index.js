const express=require('express');const axios=require('axios');
const app=express();app.use(express.json());
app.get('/events',(req,res)=>axios.get('http://event-service:3001/').then(r=>res.json(r.data)).catch(()=>res.json([{id:1,name:'Show em Picos'}])));
app.post('/tickets/buy',(req,res)=>axios.post('http://ticket-service:3002/buy',req.body).then(r=>res.json(r.data)));
app.listen(3000,()=>console.log('API Gateway OK na 3000'));
