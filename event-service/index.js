const express=require('express');const {Pool}=require('pg');
const app=express();
const pool=new Pool({connectionString:process.env.DATABASE_URL});
async function init(){
  await new Promise(r=>setTimeout(r,4000));
  await pool.query(`CREATE TABLE IF NOT EXISTS events (id SERIAL PRIMARY KEY, name TEXT)`);
  const {rows}=await pool.query('SELECT COUNT(*) FROM events');
  if(parseInt(rows[0].count)===0) await pool.query(`INSERT INTO events (name) VALUES ('Show em Picos'),('Festival Picos')`);
}
init().then(()=>console.log('event-service OK com Postgres'));
app.get('/',async(_,res)=>{const {rows}=await pool.query('SELECT * FROM events');res.json(rows);});
app.listen(3001);
