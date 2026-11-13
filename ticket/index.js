const express=require('express');const {Pool}=require('pg');
const app=express();app.use(express.json());
const pool=new Pool({connectionString:process.env.DATABASE_URL});
async function init(){
  await new Promise(r=>setTimeout(r,4000));
  await pool.query(`CREATE TABLE IF NOT EXISTS tickets (id SERIAL PRIMARY KEY, eventid INT, "user" TEXT)`);
}
init().then(()=>console.log('ticket-service OK com Postgres'));
app.get('/',async(_,res)=>{const {rows}=await pool.query('SELECT * FROM tickets');res.json(rows);});
app.post('/buy',async(req,res)=>{const {eventId,user}=req.body;const {rows}=await pool.query('INSERT INTO tickets (eventid,"user") VALUES ($1,$2) RETURNING *',[eventId,user]);res.json({msg:'ingresso salvo no Postgres!',ticket:rows[0]});});
app.listen(3002);
