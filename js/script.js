/**
 * Creates a single particle element and animates it moving up the screen.
 */
function createParticle() {
    const particle = document.createElement('div');
    document.body.appendChild(particle);

    // Generate random properties for each particle
    const size = Math.random() * 2 + 1; // width between 1px and 3px
    const speed = Math.random() * 1.5 + 1; // duration between 1s and 2.5s
    const startPosition = Math.random() * 100; // horizontal start in vw
    const length = Math.random() * 50 + 20; // height between 20px and 70px

    // Apply styles to the particle to make it look like a streak of light
    particle.style.position = 'fixed'; // Position relative to the viewport
    particle.style.bottom = `-${length}px`; // Start just below the viewport
    particle.style.left = `${startPosition}vw`;
    particle.style.width = `${size}px`;
    particle.style.height = `${length}px`;
    particle.style.backgroundColor = '#00FF00';
    particle.style.opacity = `${Math.random() * 0.5 + 0.5}`;
    particle.style.transition = `transform ${speed}s linear`;
    particle.style.zIndex = '-1';
    particle.style.boxShadow = `0 0 6px 2px #00FF00`;

    // Use a small timeout to ensure the browser applies initial styles
    // before starting the transition for the animation.
    setTimeout(() => {
        // Move the particle up and off the screen
        particle.style.transform = 'translateY(-110vh)';
    }, 10);

    // Remove the particle from the DOM after its animation is complete
    // to keep the page performant.
    setTimeout(() => {
        particle.remove();
    }, speed * 1000 + 100);
}
// Create a new particle every 50 milliseconds to create a dense starfield.
setInterval(createParticle, 100);

/**
 * Handles playing the background theme music.
 */
function playThemeMusic() {
    const themeMusic = document.getElementById('theme-music');
    if (!themeMusic) return;

    const playPromise = themeMusic.play();

    if (playPromise !== undefined) {
        playPromise.catch(() => {
            const playOnClick = () => {
                themeMusic.play();
                document.body.removeEventListener('click', playOnClick);
            };
            document.body.addEventListener('click', playOnClick);
        });
    }
}

playThemeMusic();

/**
 * Loads and displays the high score from localStorage.
 */
function displayHighScore() {
    const highScore = localStorage.getItem('spaceFightHighScore') || 0;
    const highScoreElements = document.querySelectorAll('#high-score-value');
    highScoreElements.forEach(el => {
        if (el) {
            el.textContent = highScore;
        }
    });
}
displayHighScore();

// --- Global functions for HTML onclick events ---
let BATTLE_GAME_INSTANCE = null;

function onMoveButtonClick(direction) {
    if (BATTLE_GAME_INSTANCE) {
        BATTLE_GAME_INSTANCE.handleMove(direction, false);
    }
}

function onDashButtonClick() {
    if (BATTLE_GAME_INSTANCE) {
        BATTLE_GAME_INSTANCE.handleMove(BATTLE_GAME_INSTANCE.lastDirection, true);
    }
}

/**
 * Sets up and runs the game on the battle screen.
 */
function setupBattleGame() {
    const gridContainer = document.getElementById('playfield_grid');
    if (!gridContainer) {
        return; // Exit if we're not on the battle page
    }

    // --- Game Configuration ---
    const config = {
        grid: {
            minSize: 5,
            maxSize: 21,
            defaultSize: 7,
        },
        player: {
            health: 3,
            dashDistance: 3,
            dashCooldown: 1000, // ms
            invincibilityDuration: 1000, // ms
        },
        game: {
            initialSpawnRate: 4000, // ms
            minSpawnRate: 750, // ms
            difficultyIncreaseInterval: 8, // seconds
            difficultyMultiplier: 0.9,
            collisionCheckInterval: 50, // ms
        },
        waves: [
            { score: 10, duration: 15000, types: ['sniper', 'laser'] },
            { score: 25, duration: 20000, types: ['shockwave', 'trail'] },
            { score: 40, duration: 15000, types: ['hunter', 'cross'] },
            { score: 60, duration: 10000, types: ['spinner'] },
            { score: 80, duration: 25000, types: ['guardian', 'hunter', 'sniper'] },
            { score: 100, duration: 20000, types: ['cross', 'laser', 'shockwave'] },
        ]
    };

    // --- Game State Variables ---
    let gameState = 'PRE_GAME'; // PRE_GAME, RUNNING, GAME_OVER
    let score = 0;
    let scoreInterval;
    let enemySpawnInterval;
    let gameLoopInterval;
    let playerPosition = -1;
    let playerHealth = config.player.health;
    let isInvincible = false;
    let canDash = true;
    let lastDirection = 'ArrowUp';
    let currentWave = null;
    let wavesTriggered = {};
    let allCells = [];
    let gridSize = config.grid.defaultSize;
    let cellCount = gridSize * gridSize;

    // --- Enemy Definitions ---
    const enemyTypes = {
        cross: triggerCrossAttack,
        shockwave: triggerShockwaveAttack,
        trail: triggerTrailEnemy,
        sniper: triggerSniperAttack,
        laser: triggerLaserAttack,
        hunter: triggerHunterEnemy,
        spinner: triggerSpinnerAttack,
        guardian: triggerGuardianAttack,
    };

    // --- Setup Functions ---
    function rebuildGrid() {
        gridContainer.innerHTML = '';
        allCells = [];
        cellCount = gridSize * gridSize;
        gridContainer.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
        gridContainer.style.gridTemplateRows = `repeat(${gridSize}, 1fr)`;

        for (let i = 0; i < cellCount; i++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            cell.dataset.index = i;
            gridContainer.appendChild(cell);
            allCells.push(cell);
        }

        updateGameMessage(`Grid: ${gridSize}x${gridSize}<br>Press Arrow Key`);
    }

    function setupInitialControls() {
        document.addEventListener('keydown', handleKeyDown);
    }

    function handleKeyDown(event) {
        if (gameState === 'RUNNING') {
            switch (event.key) {
                case 'ArrowUp':
                case 'ArrowDown':
                case 'ArrowLeft':
                case 'ArrowRight':
                    event.preventDefault();
                    handleMove(event.key, event.shiftKey);
                    break;
            }
        } else {
            const oldSize = gridSize;
            switch (event.key) {
                case 'Enter':
                case 'ArrowUp':
                case 'ArrowDown':
                case 'ArrowLeft':
                case 'ArrowRight':
                    event.preventDefault();
                    startGame();
                    break;
                case '+':
                case '=':
                    gridSize += 2;
                    break;
                case '-':
                    gridSize -= 2;
                    break;
            }
            gridSize = Math.max(config.grid.minSize, Math.min(config.grid.maxSize, gridSize));
            if (gridSize !== oldSize) {
                rebuildGrid();
            }
        }
    }

    function handleMove(direction, isDashing) {
        if (gameState !== 'RUNNING') {
            startGame();
            return;
        }

        lastDirection = direction;

        if (isDashing && canDash) {
            performDash(direction);
        } else if (!isDashing) {
            performMove(direction);
        }
    }

    function performMove(direction) {
        allCells[playerPosition].classList.remove('player-cell');
        const x = playerPosition % gridSize;
        const y = Math.floor(playerPosition / gridSize);

        switch (direction) {
            case 'ArrowUp':    if (y > 0) playerPosition -= gridSize; break;
            case 'ArrowDown':  if (y < gridSize - 1) playerPosition += gridSize; break;
            case 'ArrowLeft':  if (x > 0) playerPosition -= 1; break;
            case 'ArrowRight': if (x < gridSize - 1) playerPosition += 1; break;
        }
        allCells[playerPosition].classList.add('player-cell');
    }

    function performDash(direction) {
        canDash = false;
        const dashBar = document.getElementById('dash-indicator-bar');
        const dashText = document.getElementById('dash-indicator-text');
        dashBar.classList.add('cooldown');
        dashText.textContent = 'COOLDOWN';

        setTimeout(() => {
            canDash = true;
            dashBar.classList.remove('cooldown');
            dashText.textContent = 'DASH READY';
        }, config.player.dashCooldown);

        allCells[playerPosition].classList.remove('player-cell');
        const x = playerPosition % gridSize;
        const y = Math.floor(playerPosition / gridSize);

        switch (direction) {
            case 'ArrowUp':    playerPosition -= gridSize * Math.min(y, config.player.dashDistance); break;
            case 'ArrowDown':  playerPosition += gridSize * Math.min(gridSize - 1 - y, config.player.dashDistance); break;
            case 'ArrowLeft':  playerPosition -= Math.min(x, config.player.dashDistance); break;
            case 'ArrowRight': playerPosition += Math.min(gridSize - 1 - x, config.player.dashDistance); break;
        }
        allCells[playerPosition].classList.add('player-cell');
    }

    function startGame() {
        gameState = 'RUNNING';
        score = 0;
        document.getElementById('score-value').textContent = score;
        allCells.forEach(cell => cell.className = 'grid-cell');
        updateGameMessage('', true);

        playerHealth = config.player.health;
        isInvincible = false;
        canDash = true;
        wavesTriggered = {};
        currentWave = null;

        document.querySelectorAll('.heart').forEach(heart => heart.classList.remove('empty'));
        document.getElementById('dash-indicator-bar').classList.remove('cooldown');
        document.getElementById('dash-indicator-text').textContent = 'DASH READY';

        const centerX = Math.floor(gridSize / 2);
        const centerY = Math.floor(gridSize / 2);
        playerPosition = centerY * gridSize + centerX;
        allCells[playerPosition].classList.add('player-cell');

        let spawnRate = config.game.initialSpawnRate;

        clearInterval(scoreInterval);
        clearInterval(enemySpawnInterval);
        clearInterval(gameLoopInterval);

        scoreInterval = setInterval(() => {
            score++;
            document.getElementById('score-value').textContent = score;
            updateDifficulty();
            checkWaves();
        }, 1000);

        function setEnemySpawning() {
            clearInterval(enemySpawnInterval);
            enemySpawnInterval = setInterval(() => {
                const enemyCount = Math.floor(Math.random() * (gridSize / 2.5)) + 1;
                for (let i = 0; i < enemyCount; i++) {
                    spawnEnemy();
                }
            }, spawnRate);
        }

        function updateDifficulty() {
            if (score > 0 && score % config.game.difficultyIncreaseInterval === 0) {
                spawnRate = Math.max(config.game.minSpawnRate, spawnRate * config.game.difficultyMultiplier);
                setEnemySpawning();
            }
        }

        setEnemySpawning();
        spawnEnemy();
        gameLoopInterval = setInterval(checkCollision, config.game.collisionCheckInterval);
    }

    function checkWaves() {
        if (currentWave && score >= currentWave.endScore) {
            currentWave = null;
        }

        for (const wave of config.waves) {
            if (score >= wave.score && !wavesTriggered[wave.score]) {
                wavesTriggered[wave.score] = true;
                currentWave = { ...wave, endScore: score + (wave.duration / 1000) };
                break;
            }
        }
    }

    function checkCollision() {
        if (isInvincible || playerPosition === -1) return;

        const playerCell = allCells[playerPosition];
        if (playerCell.classList.contains('attack-zone') || playerCell.classList.contains('shockwave-zone') || playerCell.classList.contains('trail-zone')) {
            takeDamage();
        }
    }

    function takeDamage() {
        playerHealth--;
        isInvincible = true;

        const hearts = document.querySelectorAll('.heart:not(.empty)');
        if (hearts.length > 0) {
            hearts[hearts.length - 1].classList.add('empty');
        }

        if (playerHealth <= 0) {
            gameOver();
        } else {
            const playerCell = allCells[playerPosition];
            playerCell.style.animation = `pulse 0.2s ${config.player.invincibilityDuration / 200}`;
            setTimeout(() => {
                isInvincible = false;
                playerCell.style.animation = '';
            }, config.player.invincibilityDuration);
        }
    }

    function gameOver() {
        clearInterval(scoreInterval);
        clearInterval(enemySpawnInterval);
        clearInterval(gameLoopInterval);
        gameState = 'GAME_OVER';

        const highScore = localStorage.getItem('spaceFightHighScore') || 0;
        if (score > highScore) {
            localStorage.setItem('spaceFightHighScore', score);
            displayHighScore();
        }
        updateGameMessage('GAME OVER<br>Press Arrow Key');
    }

    function updateGameMessage(text, hide = false) {
        const messageEl = document.getElementById('game-over-message');
        const hud = document.querySelector('.hud');
        const isMobile = window.innerWidth <= 768;

        if (hide) {
            messageEl.classList.add('hidden');
            hud?.classList.remove('hidden');
        } else if (isMobile && (gameState === 'PRE_GAME' || gameState === 'GAME_OVER')) {
            messageEl.classList.add('hidden');
            hud?.classList.add('hidden');
        } else {
            messageEl.innerHTML = text;
            messageEl.classList.remove('hidden');
            hud?.classList.add('hidden');
        }
    }

    function spawnEnemy() {
        let enemyType;

        if (currentWave) {
            enemyType = currentWave.types[Math.floor(Math.random() * currentWave.types.length)];
        } else {
            const randomTypes = Object.keys(enemyTypes);
            enemyType = randomTypes[Math.floor(Math.random() * randomTypes.length)];
        }

        const triggerFunction = enemyTypes[enemyType];
        if (triggerFunction) {
            let enemyIndex;
            do {
                enemyIndex = Math.floor(Math.random() * cellCount);
            } while (enemyIndex === playerPosition);
            triggerFunction(enemyIndex);
        }
    }

    function triggerCrossAttack(enemyIndex) {
        const columnIndex = enemyIndex % gridSize;
        const rowIndex = Math.floor(enemyIndex / gridSize);
        const telegraphCells = [];

        for (let i = 0; i < gridSize; i++) {
            telegraphCells.push(allCells[columnIndex + i * gridSize]); // Column
            telegraphCells.push(allCells[rowIndex * gridSize + i]); // Row
        }

        const enemyCell = allCells[enemyIndex];
        enemyCell.classList.add('enemy');
        telegraphCells.forEach(cell => cell.classList.add('telegraph-zone'));

        setTimeout(() => {
            enemyCell.classList.remove('enemy');
            telegraphCells.forEach(cell => {
                cell.classList.remove('telegraph-zone');
                cell.classList.add('attack-zone');
            });

            setTimeout(() => {
                telegraphCells.forEach(cell => cell.classList.remove('attack-zone'));

                const diagTelegraphCells = [];
                for (let i = 1; i < gridSize; i++) {
                    const tl = enemyIndex - (i * gridSize) - i;
                    const tr = enemyIndex - (i * gridSize) + i;
                    const bl = enemyIndex + (i * gridSize) - i;
                    const br = enemyIndex + (i * gridSize) + i;
                    if (Math.floor(tl / gridSize) === rowIndex - i) diagTelegraphCells.push(allCells[tl]);
                    if (Math.floor(tr / gridSize) === rowIndex - i) diagTelegraphCells.push(allCells[tr]);
                    if (Math.floor(bl / gridSize) === rowIndex + i) diagTelegraphCells.push(allCells[bl]);
                    if (Math.floor(br / gridSize) === rowIndex + i) diagTelegraphCells.push(allCells[br]);
                }
                diagTelegraphCells.forEach(cell => cell && cell.classList.add('telegraph-zone'));
                setTimeout(() => {
                    diagTelegraphCells.forEach(cell => cell && cell.classList.remove('telegraph-zone'));
                    diagTelegraphCells.forEach(cell => cell && cell.classList.add('attack-zone'));
                    setTimeout(() => {
                        diagTelegraphCells.forEach(cell => cell && cell.classList.remove('attack-zone'));
                    }, 300);
                }, 500);
            }, 300);

        }, 2000);
    }

    function triggerShockwaveAttack(enemyIndex) {
        const ex = enemyIndex % gridSize;
        const ey = Math.floor(enemyIndex / gridSize);
        const enemyCell = allCells[enemyIndex];
        enemyCell.classList.add('shockwave-enemy');
        
        setTimeout(() => {
            enemyCell.classList.remove('shockwave-enemy');
            const attackedCells = [];

            const radius = Math.floor(gridSize / 3);
            for (let dist = 0; dist <= radius; dist++) {
                setTimeout(() => {
                    allCells.forEach((cell, index) => {
                        const cx = index % gridSize;
                        const cy = Math.floor(index / gridSize);
                        if (Math.abs(cx - ex) + Math.abs(cy - ey) === dist) {
                            cell.classList.add('shockwave-zone');
                            attackedCells.push(cell);
                        }
                    });
                }, dist * 250);
            }

            const totalAttackDuration = radius * 250 + 500;
            setTimeout(() => {
                attackedCells.forEach(cell => cell.classList.remove('shockwave-zone'));
            }, totalAttackDuration);

        }, 1000);
    }

    function triggerTrailEnemy(startIndex) {
        let currentPos = startIndex;
        let moves = 0;
        const maxMoves = 15;

        allCells[currentPos].classList.add('trail-enemy');

        const moveInterval = setInterval(() => {
            if (moves >= maxMoves) {
                clearInterval(moveInterval);
                allCells[currentPos].classList.remove('trail-enemy');
                return;
            }

            allCells[currentPos].classList.remove('trail-enemy');
            allCells[currentPos].classList.add('trail-zone');
            const trailCell = allCells[currentPos];
            setTimeout(() => trailCell.classList.remove('trail-zone'), 3000);

            const possibleMoves = [];
            const x = currentPos % gridSize;
            const y = Math.floor(currentPos / gridSize);
            if (x > 0) possibleMoves.push(currentPos - 1);
            if (x < gridSize - 1) possibleMoves.push(currentPos + 1);
            if (y > 0) possibleMoves.push(currentPos - gridSize);
            if (y < gridSize - 1) possibleMoves.push(currentPos + gridSize);

            currentPos = possibleMoves[Math.floor(Math.random() * possibleMoves.length)] || currentPos;
            allCells[currentPos].classList.add('trail-enemy');
            moves++;
        }, 400);
    }

    function triggerSniperAttack(enemyIndex) {
        const enemyCell = allCells[enemyIndex];
        enemyCell.classList.add('sniper-enemy');

        setTimeout(() => {
            enemyCell.classList.remove('sniper-enemy');
            const targetIndex = playerPosition;
            if (targetIndex === -1) return;

            const targetCell = allCells[targetIndex];
            targetCell.classList.add('telegraph-zone');

            setTimeout(() => {
                targetCell.classList.remove('telegraph-zone');
                targetCell.classList.add('attack-zone');

                setTimeout(() => {
                    targetCell.classList.remove('attack-zone');
                }, 500);

            }, 750);

        }, 2000);
    }

    function triggerLaserAttack(enemyIndex) {
        const enemyCell = allCells[enemyIndex];
        enemyCell.classList.add('laser-enemy');

        const telegraphCells = [];
        const rowIndex = Math.floor(enemyIndex / gridSize);
        const columnIndex = enemyIndex % gridSize;
        for (let i = 0; i < gridSize; i++) {
            telegraphCells.push(allCells[rowIndex * gridSize + i]);
            telegraphCells.push(allCells[columnIndex + i * gridSize]);
        }

        telegraphCells.forEach(cell => cell.classList.add('telegraph-zone'));

        setTimeout(() => {
            enemyCell.classList.remove('laser-enemy');
            telegraphCells.forEach(cell => {
                cell.classList.remove('telegraph-zone');
                cell.classList.add('attack-zone');
            });
            setTimeout(() => {
                telegraphCells.forEach(cell => cell.classList.remove('attack-zone'));
            }, 500);
        }, 2000);
    }

    function triggerHunterEnemy(startIndex) {
        let currentPos = startIndex;
        let moves = 0;
        const maxMoves = 8;

        if (!allCells[currentPos]) return;
        allCells[currentPos].classList.add('hunter-enemy');

        const moveInterval = setInterval(() => {
            if (moves >= maxMoves || gameState !== 'RUNNING') {
                clearInterval(moveInterval);
                if (allCells[currentPos]) allCells[currentPos].classList.remove('hunter-enemy');
                return;
            }

            if (allCells[currentPos]) {
                allCells[currentPos].classList.remove('hunter-enemy');
                allCells[currentPos].classList.add('trail-zone');
                const trailCell = allCells[currentPos];
                setTimeout(() => trailCell.classList.remove('trail-zone'), 2000);
            }

            const playerX = playerPosition % gridSize;
            const playerY = Math.floor(playerPosition / gridSize);
            const hunterX = currentPos % gridSize;
            const hunterY = Math.floor(currentPos / gridSize);

            const dx = playerX - hunterX;
            const dy = playerY - hunterY;

            if (Math.abs(dx) > Math.abs(dy)) {
                currentPos += Math.sign(dx);
            } else {
                currentPos += Math.sign(dy) * gridSize;
            }
            if (allCells[currentPos]) allCells[currentPos].classList.add('hunter-enemy');
            moves++;
        }, 200);
    }

    function triggerSpinnerAttack(enemyIndex) {
        const enemyCell = allCells[enemyIndex];
        enemyCell.classList.add('spinner-enemy');

        setTimeout(() => {
            enemyCell.classList.remove('spinner-enemy');
            let angle = Math.random() * 360;
            const rotationSpeed = (Math.random() < 0.5 ? 3 : -3);
            const laserLength = gridSize;
            let frames = 0;
            const totalFrames = 360 / Math.abs(rotationSpeed);
            let previousLaserCells = [];

            const spinInterval = setInterval(() => {
                if (frames >= totalFrames || gameState !== 'RUNNING') {
                    clearInterval(spinInterval);
                    previousLaserCells.forEach(c => c && c.classList.remove('attack-zone'));
                    return;
                }

                previousLaserCells.forEach(c => c && c.classList.remove('attack-zone'));
                const currentLaserCells = [];

                for (let i = 1; i < laserLength; i++) {
                    const rad = angle * (Math.PI / 180);
                    const x = Math.round((enemyIndex % gridSize) + i * Math.cos(rad));
                    const y = Math.round(Math.floor(enemyIndex / gridSize) + i * Math.sin(rad));
                    if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
                        const cell = allCells[y * gridSize + x];
                        if (cell) {
                            cell.classList.add('attack-zone');
                            currentLaserCells.push(cell);
                        }
                    }
                }
                for (let i = 1; i < laserLength; i++) {
                    const rad = (angle + 180) * (Math.PI / 180);
                    const x = Math.round((enemyIndex % gridSize) + i * Math.cos(rad));
                    const y = Math.round(Math.floor(enemyIndex / gridSize) + i * Math.sin(rad));
                    if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
                        const cell = allCells[y * gridSize + x];
                        if (cell) {
                            cell.classList.add('attack-zone');
                            currentLaserCells.push(cell);
                        }
                    }
                }
                previousLaserCells = currentLaserCells;
                angle += rotationSpeed;
                frames++;
            }, 50);
        }, 2000);
    }

    function triggerGuardianAttack(enemyIndex) {
        const ex = enemyIndex % gridSize;
        const ey = Math.floor(enemyIndex / gridSize);
        const enemyCell = allCells[enemyIndex];
        enemyCell.classList.add('guardian-enemy');

        setTimeout(() => {
            enemyCell.classList.remove('guardian-enemy');
            const safeCells = [];
            const radius = Math.floor(gridSize / 4);

            for (let dist = 0; dist <= radius; dist++) {
                setTimeout(() => {
                    allCells.forEach((cell, index) => {
                        const cx = index % gridSize;
                        const cy = Math.floor(index / gridSize);
                        if (Math.abs(cx - ex) + Math.abs(cy - ey) === dist) {
                            cell.classList.remove('attack-zone', 'shockwave-zone', 'trail-zone');
                            cell.classList.add('safe-zone');
                            safeCells.push(cell);
                        }
                    });
                }, dist * 200);
            }

            const totalEffectDuration = radius * 200 + 1000;
            setTimeout(() => safeCells.forEach(cell => cell.classList.remove('safe-zone')), totalEffectDuration);
        }, 1500);
    }

    BATTLE_GAME_INSTANCE = {
        handleMove,
        get lastDirection() { return lastDirection; }
    };

    rebuildGrid();
    setupInitialControls();
}

setupBattleGame();
