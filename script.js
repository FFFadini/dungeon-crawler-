// --- CONFIGURAÇÕES BÁSICAS ---
const MAP_WIDTH = 62;
const MAP_HEIGHT = 34;
const ENCOUNTER_TIME_MS = 30000;

function createInitialPlayer() {
    return {
        x: 15, y: 10,
        level: 1, xp: 0, nextXp: 50,
        hp: 100, maxHp: 100,
        points: 0, potions: 0,
        stats: { forca: 5, velocidade: 5, critico: 1, vida: 10, mana: 5, feitico: 0 },
        inventory: []
    };
}

let player = createInitialPlayer();
let gameState = 'EXPLORING';
let mapData = [];
let encounterTimerId = null;
let currentEnemy = null;
let combatSequence = [];
let sequenceIndex = 0;
let enemyAttackTimer = 0;
let enemyAttackMax = 100;
let combatAnimationId = null;
let lastFrameTime = 0;
let isBossFight = false;

const asciiDisplay = document.getElementById('ascii-display');
const playerHpBar = document.getElementById('player-hp-bar');
const playerHpText = document.getElementById('player-hp-text');
const enemyUi = document.getElementById('enemy-ui');
const enemyHpBar = document.getElementById('enemy-hp-bar');
const enemyAttackBar = document.getElementById('enemy-attack-bar');
const combatSequenceDiv = document.getElementById('combat-sequence');
const arrowSequenceDiv = document.getElementById('arrow-sequence');
const gameScreen = document.getElementById('game-screen');
const messageLog = document.getElementById('message-log');
const gameOverScreen = document.getElementById('gameover-screen');

// --- LOG ---
function addLog(msg, type = 'info') {
    const li = document.createElement('li');
    li.className = 'log-entry log-' + type;
    li.innerText = msg;
    messageLog.prepend(li);
    while (messageLog.children.length > 50) messageLog.removeChild(messageLog.lastChild);
}

// --- ARTS ---
const enemyArts = {
    slime:       "   .--.   \n  ( o  o )\n   \\  __/ \n ~~~~~~~~~\n   SLIME  ",
    goblin:      "  .---.  \n |o_o |  \n |\\_/ |  \n //   \\\\\n  GOBLIN ",
    caveira:     "   .-.   \n  (x.x)  \n  |=.|   \n  '--'   \n CAVEIRA ",
    orc:         " /\\O/\\ \n |___| \n (   ) \n /| |\\ \n   ORC  ",
    dragon:      "/\\_/\\/\\\n( o   o)\n \\  v  /\n |||||  \n DRAGAO ",
    lich:        "  .~~~.  \n  ( * * )\n   )   ( \n  (_____)\n   LICH  ",
    boss_goblin: "  _____  \n /o   o\\ \n|  ___  |\n| /   \\ |\n  CHEFE  \n GOBLIN ",
    boss_cav:    "  _____  \n (X) (X)\n  |___|  \n /|   |\\ \n  BOSS   \nCAVEIRA ",
    boss_dragon: "/=====\\ \n( O   O)\n \\  W  / \n||===|| \n  BOSS   \n DRAGAO "
};

function getEnemyArt(name, isBoss) {
    if (isBoss) {
        if (name === 'Goblin')  return enemyArts.boss_goblin;
        if (name === 'Caveira') return enemyArts.boss_cav;
        return enemyArts.boss_dragon;
    }
    const map = { 'Slime':'slime','Goblin':'goblin','Caveira':'caveira','Orc':'orc','Dragao':'dragon','Lich':'lich' };
    return enemyArts[map[name]] || enemyArts.slime;
}

function getEnemyByLevel(level) {
    if (level >= 9)  return 'Lich';
    if (level >= 7)  return 'Dragao';
    if (level >= 5)  return 'Orc';
    if (level >= 3)  return 'Caveira';
    if (level >= 2)  return 'Goblin';
    return 'Slime';
}

// --- INIT ---
function init() {
    generateMap();
    updateUI();
    updateInventoryUI();
    startEncounterTimer();
    renderMap();
    addLog('Você adentra a Neon Dungeon...', 'system');
}

function restartGame() {
    cancelAnimationFrame(combatAnimationId);
    clearInterval(encounterTimerId);
    player = createInitialPlayer();
    gameState = 'EXPLORING';
    currentEnemy = null;
    isBossFight = false;
    enemyUi.classList.add('hidden');
    combatSequenceDiv.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    gameScreen.classList.remove('flash-damage','flash-boss');
    messageLog.innerHTML = '';
    generateMap();
    updateUI();
    updateInventoryUI();
    startEncounterTimer();
    renderMap();
    addLog('Nova aventura começou!', 'system');
}

// --- MAPA ---
function generateMap() {
    mapData = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
        let row = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (y===0||y===MAP_HEIGHT-1||x===0||x===MAP_WIDTH-1) row.push('#');
            else row.push(Math.random() > 0.95 ? '?' : '.');
        }
        mapData.push(row);
    }
    mapData[player.y][player.x] = '.';
}

function placeBossEntrance() {
    let placed = false;
    let tries = 0;
    while (!placed && tries < 200) {
        let bx = Math.floor(Math.random()*(MAP_WIDTH-2))+1;
        let by = Math.floor(Math.random()*(MAP_HEIGHT-2))+1;
        if (mapData[by][bx] === '.') { mapData[by][bx] = 'B'; placed = true; }
        tries++;
    }
}

function renderMap() {
    if (gameState !== 'EXPLORING') return;
    let s = "";
    for (let y=0;y<MAP_HEIGHT;y++) {
        for (let x=0;x<MAP_WIDTH;x++) {
            s += (x===player.x&&y===player.y) ? "@" : mapData[y][x];
        }
        s += "\n";
    }
    asciiDisplay.innerText = s;
}

function startEncounterTimer() {
    if (encounterTimerId) clearInterval(encounterTimerId);
    encounterTimerId = setInterval(() => {
        if (gameState === 'EXPLORING') startCombat(false);
    }, ENCOUNTER_TIME_MS);
}

function movePlayer(dx, dy) {
    if (gameState !== 'EXPLORING') return;
    let nx = player.x+dx, ny = player.y+dy;
    if (mapData[ny][nx] !== '#') {
        player.x = nx; player.y = ny;
        const cell = mapData[ny][nx];
        if (cell === '?') { mapData[ny][nx]='.'; collectItem(); }
        else if (cell === 'B') { mapData[ny][nx]='.'; addLog('Você encontrou a sala do BOSS!','danger'); startCombat(true); return; }
        if (gameState==='EXPLORING') {
            if (Math.random()<0.10) startCombat(false);
            else renderMap();
        }
    }
}

// --- ITENS ---
function collectItem() {
    const types = ["Espada","Armadura","Anel","Poção"];
    const type = types[Math.floor(Math.random()*types.length)];
    if (type==="Poção") { player.potions++; updateInventoryUI(); addLog('Você pegou uma Pocao!','success'); return; }
    let itemName = type+' Lvl '+player.level, statsGained = "";
    if (type==="Espada") {
        if (player.level>10&&Math.random()>0.5) { player.stats.forca+=2; player.stats.critico+=1; statsGained="(+2 For, +1 Crit)"; }
        else if (Math.random()>0.5) { player.stats.forca+=2; statsGained="(+2 For)"; }
        else { player.stats.critico+=1; statsGained="(+1 Crit)"; }
    } else if (type==="Armadura") {
        player.maxHp+=20; player.hp=Math.min(player.hp+20,player.maxHp); statsGained="(+20 Max HP)";
    } else if (type==="Anel") {
        const rs=["critico","velocidade","vida","forca"][Math.floor(Math.random()*4)];
        if (rs==="vida") { player.maxHp+=15; player.hp=Math.min(player.hp+15,player.maxHp); statsGained="(+15 Max HP)"; }
        else { player.stats[rs]+=1; statsGained="(+1 "+rs.charAt(0).toUpperCase()+rs.slice(1)+")"; }
    }
    player.inventory.push(itemName+' '+statsGained);
    addLog('Encontrou: '+itemName+' '+statsGained,'success');
    updateUI(); updateInventoryUI();
}

function usePotion() {
    if (player.potions>0&&player.hp<player.maxHp) {
        player.potions--;
        let healed = Math.min(50,player.maxHp-player.hp);
        healPlayer(50); updateInventoryUI();
        addLog('Poção usada! +'+healed+' HP','success');
    } else if (player.potions===0) addLog('Sem poções!','danger');
    else addLog('Vida já está cheia!','info');
}

// --- COMBATE ---
function startCombat(boss) {
    gameState = 'COMBAT';
    isBossFight = boss;
    clearInterval(encounterTimerId);
    let eLevel = boss ? player.level+2 : player.level+Math.floor(Math.random()*2);
    let eName = boss ? getBossName() : getEnemyByLevel(eLevel);
    let hm = boss?3:1, dm = boss?2:1;
    currentEnemy = { name:eName, level:eLevel, maxHp:(30+eLevel*15)*hm, hp:(30+eLevel*15)*hm, baseDamage:(5+eLevel*3)*dm, isBoss:boss };
    asciiDisplay.innerText = getEnemyArt(eName, boss);
    enemyUi.classList.remove('hidden');
    document.getElementById('enemy-name').innerText = (boss?'BOSS: ':'')+currentEnemy.name;
    document.getElementById('enemy-level').innerText = currentEnemy.level;
    combatSequenceDiv.classList.remove('hidden');
    if (boss) { gameScreen.classList.add('flash-boss'); addLog('BOSS "'+eName+'" Lv '+eLevel+' apareceu!','danger'); }
    else addLog('Inimigo "'+eName+'" Lv '+eLevel+' apareceu!','warning');
    updateEnemyHPBar(); generateNewSequence();
    enemyAttackTimer = 0;
    enemyAttackMax = 2000-(eLevel*50)+(player.stats.velocidade*20);
    if (boss) enemyAttackMax = Math.max(400,enemyAttackMax*0.7);
    if (enemyAttackMax<500) enemyAttackMax=500;
    lastFrameTime = performance.now();
    combatAnimationId = requestAnimationFrame(combatLoop);
}

function getBossName() {
    if (player.level>=10) return 'Dragao';
    if (player.level>=5)  return 'Caveira';
    return 'Goblin';
}

function combatLoop(timestamp) {
    if (gameState!=='COMBAT') return;
    let delta = timestamp-lastFrameTime; lastFrameTime=timestamp;
    enemyAttackTimer += delta;
    enemyAttackBar.style.width = Math.max(0,100-((enemyAttackTimer/enemyAttackMax)*100))+"%";
    if (enemyAttackTimer>=enemyAttackMax) { enemyAttackTimer=0; takeDamage(currentEnemy.baseDamage); }
    if (gameState==='COMBAT') combatAnimationId=requestAnimationFrame(combatLoop);
}

function generateNewSequence() {
    const arrows=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
    let len = Math.min(8,3+Math.floor(player.level/2));
    if (isBossFight) len=Math.min(10,len+2);
    combatSequence=[]; for(let i=0;i<len;i++) combatSequence.push(arrows[Math.floor(Math.random()*4)]);
    sequenceIndex=0; renderSequence();
}

function getArrowSymbol(key) {
    return {'ArrowUp':'↑','ArrowDown':'↓','ArrowLeft':'←','ArrowRight':'→'}[key]||'';
}

function renderSequence(flashError=false) {
    arrowSequenceDiv.innerHTML="";
    combatSequence.forEach((key,i)=>{
        let span=document.createElement('span');
        span.innerText=getArrowSymbol(key);
        if(i<sequenceIndex) span.classList.add('arrow-done');
        else if(flashError&&i===sequenceIndex) span.classList.add('arrow-error');
        arrowSequenceDiv.appendChild(span);
    });
}

function showCriticalText() {
    const old=document.getElementById('crit-text'); if(old) old.remove();
    const el=document.createElement('div');
    el.id='crit-text'; el.innerText='CRITICO!'; el.className='crit-popup';
    gameScreen.appendChild(el); setTimeout(()=>el.remove(),900);
}

function showDamageNumber(dmg,isCrit) {
    const el=document.createElement('div');
    el.innerText='-'+dmg; el.className='damage-number'+(isCrit?' damage-crit':'');
    el.style.left=(30+Math.random()*40)+'%'; el.style.top=(20+Math.random()*40)+'%';
    gameScreen.appendChild(el); setTimeout(()=>el.remove(),900);
}

function handleCombatInput(key) {
    if (gameState!=='COMBAT') return;
    if (key===combatSequence[sequenceIndex]) {
        sequenceIndex++; renderSequence();
        if (sequenceIndex>=combatSequence.length) {
            let isCrit=Math.random()*100<player.stats.critico*2;
            let dmg=player.stats.forca*2+player.stats.feitico;
            if (isCrit) { dmg*=2; showCriticalText(); addLog('CRITICO! +'+dmg+' dano!','success'); }
            else addLog('Causou '+dmg+' de dano ao '+currentEnemy.name+'.','info');
            showDamageNumber(dmg,isCrit);
            currentEnemy.hp-=dmg; updateEnemyHPBar();
            if (currentEnemy.hp<=0) endCombat(true); else generateNewSequence();
        }
    } else {
        renderSequence(true);
        gameScreen.classList.add('flash-damage');
        setTimeout(()=>gameScreen.classList.remove('flash-damage'),300);
        setTimeout(()=>{sequenceIndex=0;renderSequence();},300);
        addLog('Sequencia errada!','danger');
    }
}

function updateEnemyHPBar() {
    enemyHpBar.style.width=Math.max(0,(currentEnemy.hp/currentEnemy.maxHp)*100)+"%";
}

function takeDamage(amount) {
    player.hp=Math.max(0,player.hp-amount);
    addLog(currentEnemy.name+' causou '+amount+' de dano!','danger');
    gameScreen.classList.add('flash-damage');
    setTimeout(()=>gameScreen.classList.remove('flash-damage'),300);
    updateUI();
    if (player.hp<=0) endCombat(false);
}

function healPlayer(amount) {
    player.hp=Math.min(player.maxHp,player.hp+amount); updateUI();
}

function endCombat(won) {
    gameState = won?'EXPLORING':'GAMEOVER';
    cancelAnimationFrame(combatAnimationId);
    enemyUi.classList.add('hidden');
    combatSequenceDiv.classList.add('hidden');
    gameScreen.classList.remove('flash-boss');
    if (won) {
        let xp=currentEnemy.level*20*(isBossFight?3:1);
        player.xp+=xp;
        addLog('Venceu '+currentEnemy.name+'! +'+xp+' XP','success');
        // BUG FIX: loop para múltiplos level ups
        while (player.xp>=player.nextXp) levelUp();
        updateUI(); renderMap(); startEncounterTimer();
    } else {
        const goLevel = document.getElementById('go-level');
        if (goLevel) goLevel.innerText = player.level;
        gameOverScreen.classList.remove('hidden');
        addLog('Voce foi derrotado...','danger');
    }
}

// --- RPG ---
function levelUp() {
    player.level++; player.xp-=player.nextXp;
    player.nextXp=Math.floor(player.nextXp*1.5);
    player.points+=4; healPlayer(player.maxHp);
    addLog('LEVEL UP! Nivel '+player.level+'! +4 pontos.','system');
    if (player.level%5===0) {
        placeBossEntrance();
        addLog('Uma sala de BOSS apareceu! Procure pelo "B".','warning');
        renderMap();
    }
}

function allocateStat(statKey) {
    if (player.points>0) {
        player.stats[statKey]++; player.points--;
        if (statKey==='vida') { player.maxHp+=10; player.hp+=10; }
        addLog(statKey+' aumentou para '+player.stats[statKey]+'.','info');
        updateUI();
    }
}

// --- UI ---
function updateUI() {
    document.getElementById('player-level').innerText=player.level;
    document.getElementById('player-xp').innerText=player.xp;
    document.getElementById('player-next-xp').innerText=player.nextXp;
    document.getElementById('stat-points').innerText=player.points;
    playerHpText.innerText=player.hp+'/'+player.maxHp;
    playerHpBar.style.width=Math.max(0,(player.hp/player.maxHp)*100)+"%";
    const attrsDiv=document.getElementById('attributes-list');
    attrsDiv.innerHTML="";
    const labels={forca:"Forca",velocidade:"Velocidade",critico:"Critico",vida:"Vida",mana:"Mana",feitico:"Feitico"};
    for (const key in player.stats) {
        let row=document.createElement('div'); row.className='stat-row';
        let ns=document.createElement('span'); ns.innerText=labels[key]+': '+player.stats[key];
        row.appendChild(ns);
        if (player.points>0) {
            let btn=document.createElement('button'); btn.className='btn-add'; btn.innerText='+';
            btn.onclick=()=>allocateStat(key); row.appendChild(btn);
        }
        attrsDiv.appendChild(row);
    }
}

function updateInventoryUI() {
    document.getElementById('potion-count').innerText=player.potions;
    const invList=document.getElementById('inventory-list'); invList.innerHTML="";
    player.inventory.forEach(item=>{ let li=document.createElement('li'); li.innerText=item; invList.appendChild(li); });
}

// --- CONTROLES ---
function handleInput(key) {
    if (gameState==='EXPLORING') {
        if(key==='ArrowUp') movePlayer(0,-1);
        else if(key==='ArrowDown') movePlayer(0,1);
        else if(key==='ArrowLeft') movePlayer(-1,0);
        else if(key==='ArrowRight') movePlayer(1,0);
    } else if (gameState==='COMBAT') { handleCombatInput(key); }
}

document.addEventListener('keydown',(e)=>{
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();handleInput(e.key);}
});
document.getElementById('btn-up').addEventListener('click',()=>handleInput('ArrowUp'));
document.getElementById('btn-down').addEventListener('click',()=>handleInput('ArrowDown'));
document.getElementById('btn-left').addEventListener('click',()=>handleInput('ArrowLeft'));
document.getElementById('btn-right').addEventListener('click',()=>handleInput('ArrowRight'));

init();