#!/usr/bin/env node
'use strict';
const {startSimulator}=require('./simulator.cjs');
(async()=>{const sim=await startSimulator();console.log('FBS practice: '+sim.origin+'/fbs\niLab practice: '+sim.origin+'/ilab\nSynthetic records only. Press Ctrl+C to stop.');process.on('SIGINT',async()=>{await sim.close();process.exit(0)})})().catch(e=>{console.error(e.message);process.exit(1)});
