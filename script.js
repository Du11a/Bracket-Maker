class BracketManager {
    constructor() {
        this.teams = [];
        this.bracket = [];
        this.lBracket = [];
        this.gfBracket = [];
        this.type = 'single';

        // DOM Elements
        this.setupPanel = document.getElementById('setup-panel');
        this.bracketView = document.getElementById('bracket-view');
        this.container = document.getElementById('bracket-container');
        
        // Event Listeners
        document.getElementById('generate-btn').addEventListener('click', () => this.init());
        document.getElementById('edit-btn').addEventListener('click', () => this.toggleView(true));
        document.getElementById('reset-btn').addEventListener('click', () => this.resetBracket());
        document.getElementById('fit-btn').addEventListener('click', () => this.fitToScreen());
        document.getElementById('share-btn').addEventListener('click', () => this.shareBracket());
        this.bindEvents();
        this.checkSharedState();
    }

    toggleView(showSetup) {
        if (showSetup) {
            this.setupPanel.classList.remove('hidden');
            this.bracketView.classList.add('hidden');
        } else {
            this.setupPanel.classList.add('hidden');
            this.bracketView.classList.remove('hidden');
        }
    }

    bindEvents() {
        // Global Drag End (cleanup)
        document.addEventListener('dragend', (e) => {
            if (e.target.classList && e.target.classList.contains('dragging')) {
                e.target.classList.remove('dragging');
            }
        });

        // Sidebar Delegation
        const sidebarList = document.getElementById('sidebar-list');
        sidebarList.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('sidebar-item')) {
                e.dataTransfer.setData('text/plain', e.target.textContent);
                e.dataTransfer.effectAllowed = 'copy';
                this.setFloatingDragImage(e, e.target);
            }
        });

        // Sidebar Click (Mobile Selection Support)
        sidebarList.addEventListener('click', (e) => {
            if (e.target.classList.contains('sidebar-item')) {
                const wasSelected = e.target.classList.contains('selected');
                // Deselect all
                Array.from(sidebarList.children).forEach(el => el.classList.remove('selected'));
                // Toggle selection
                if (!wasSelected) e.target.classList.add('selected');
            }
        });

        // Bracket Container Delegation
        this.container.addEventListener('click', (e) => {
            const participant = e.target.closest('.participant');
            // Ignore clicks on inputs
            if (participant && e.target.tagName !== 'INPUT') {
                const match = participant.closest('.match');
                const { bracketType, rIdx, mIdx } = match.dataset;
                const { slotKey } = participant.dataset;

                // Check for Sidebar Selection Placement (Mobile)
                const selectedItem = document.querySelector('.sidebar-item.selected');
                if (selectedItem) {
                    this.updateParticipant(bracketType, parseInt(rIdx), parseInt(mIdx), slotKey, selectedItem.textContent);
                    selectedItem.classList.remove('selected');
                    this.render();
                    return;
                }

                const data = this.getMatchData(bracketType, rIdx, mIdx)[slotKey];
                
                if (data.name && data.name !== "BYE") {
                    this.advance(bracketType, parseInt(rIdx), parseInt(mIdx), slotKey);
                }
            }
        });

        this.container.addEventListener('input', (e) => {
            const match = e.target.closest('.match');
            if (!match) return;
            const { bracketType, rIdx, mIdx } = match.dataset;
            const matchData = this.getMatchData(bracketType, rIdx, mIdx);

            if (e.target.classList.contains('score')) {
                const participant = e.target.closest('.participant');
                const { slotKey } = participant.dataset;
                matchData[slotKey].score = e.target.value;
            } else if (e.target.classList.contains('match-label')) {
                matchData.label = e.target.value;
            }
        });

        this.container.addEventListener('dragstart', (e) => this.handleDragStart(e));
        this.container.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.container.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.container.addEventListener('drop', (e) => this.handleDrop(e));
    }

    getBracketArray(type) {
        if (type === 'main') return this.bracket;
        if (type === 'losers') return this.lBracket;
        if (type === 'finals') return this.gfBracket;
        return this.bracket;
    }

    getMatchData(type, rIdx, mIdx) {
        return this.getBracketArray(type)[rIdx][mIdx];
    }

    handleDragStart(e) {
        const target = e.target;
        if (target.classList.contains('match')) {
            const { bracketType, rIdx, mIdx } = target.dataset;
            e.dataTransfer.setData('application/json', JSON.stringify({ 
                dragType: 'match', bracketType, rIdx: parseInt(rIdx), mIdx: parseInt(mIdx) 
            }));
            e.dataTransfer.effectAllowed = 'move';
            this.setFloatingDragImage(e, target);
            target.classList.add('dragging');
        } else if (target.classList.contains('participant')) {
            const match = target.closest('.match');
            const { bracketType, rIdx, mIdx } = match.dataset;
            const { slotKey } = target.dataset;
            const data = this.getMatchData(bracketType, rIdx, mIdx)[slotKey];
            
            if (data.name && data.name !== "BYE") {
                e.dataTransfer.setData('text/plain', data.name);
                e.dataTransfer.setData('application/json', JSON.stringify({ 
                    dragType: 'participant', bracketType, rIdx: parseInt(rIdx), mIdx: parseInt(mIdx), slotKey 
                }));
                e.dataTransfer.effectAllowed = 'copy';
                this.setFloatingDragImage(e, target);
                target.classList.add('dragging');
            } else {
                e.preventDefault();
            }
        }
    }

    handleDragOver(e) {
        const target = e.target.closest('.match, .participant');
        if (target) {
            e.preventDefault();
            e.stopPropagation();
            target.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        const target = e.target.closest('.match, .participant');
        // Prevent flickering when hovering over children
        if (target && !target.contains(e.relatedTarget)) {
            target.classList.remove('drag-over');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const target = e.target.closest('.match, .participant');
        if (!target) return;
        
        target.classList.remove('drag-over');
        const json = e.dataTransfer.getData('application/json');
        
        if (json) {
            const source = JSON.parse(json);
            
            if (source.dragType === 'match' && target.classList.contains('match')) {
                const { bracketType, rIdx, mIdx } = target.dataset;
                if (source.bracketType === bracketType && source.rIdx === parseInt(rIdx) && source.mIdx !== parseInt(mIdx)) {
                    this.swapMatches(source, { bracketType, rIdx: parseInt(rIdx), mIdx: parseInt(mIdx) });
                }
            } else if (source.dragType === 'participant' && target.classList.contains('participant')) {
                const match = target.closest('.match');
                const { bracketType, rIdx, mIdx } = match.dataset;
                const { slotKey } = target.dataset;
                
                if (source.bracketType === bracketType && source.rIdx === parseInt(rIdx) && source.mIdx === parseInt(mIdx) && source.slotKey === slotKey) return;
                this.swapTeams(source, { bracketType, rIdx: parseInt(rIdx), mIdx: parseInt(mIdx), slotKey });
            }
        }
    }

    init() {
        const rawInput = document.getElementById('team-input').value.trim();
        if (!rawInput) return alert("Please enter team names.");

        this.teams = rawInput.split('\n').map(t => t.trim()).filter(t => t);
        if (this.teams.length < 2) return alert("Need at least 2 teams.");

        const tournamentName = document.getElementById('tournament-name').value.trim();
        document.getElementById('tournament-title-display').textContent = tournamentName || "Tournament Bracket";

        this.type = document.getElementById('bracket-type').value;
        this.generateStructure();
        this.renderSidebar();
        this.render();
        this.container.style.transform = 'scale(1)'; // Reset scale on new generation
        this.toggleView(false);
    }

    generateStructure() {
        // 1. Calculate Power of 2
        const count = this.teams.length;
        const size = Math.pow(2, Math.ceil(Math.log2(count)));
        
        // 2. Create Round 1 with Byes
        // Sequential pairing: 1 vs 2, 3 vs 4, etc.
        let round1 = [];
        const half = size / 2;
        
        for (let i = 0; i < half; i++) {
            const p1 = this.teams[i * 2] || "BYE";
            const p2 = this.teams[i * 2 + 1] || "BYE";
            
            round1.push({
                id: `r0_m${i}`,
                label: '',
                p1: { name: p1, score: '' },
                p2: { name: p2, score: '' },
                winner: null
            });
        }

        this.bracket = [round1];

        // 3. Generate Empty Subsequent Rounds
        let matchesInRound = half;
        let roundIdx = 1;

        while (matchesInRound > 1) {
            matchesInRound /= 2;
            let round = [];
            for (let i = 0; i < matchesInRound; i++) {
                round.push({
                    id: `r${roundIdx}_m${i}`,
                    label: '',
                    p1: { name: null, score: '' },
                    p2: { name: null, score: '' },
                    winner: null
                });
            }
            this.bracket.push(round);
            roundIdx++;
        }

        // 4. Apply Labels to Main Bracket
        const totalRounds = this.bracket.length;
        this.bracket.forEach((round, rIdx) => {
            round.forEach(match => {
                if (rIdx === totalRounds - 1) {
                    match.label = this.type === 'single' ? "Grand Finals" : "Winners Finals";
                } else if (rIdx === totalRounds - 2) {
                    match.label = this.type === 'single' ? "Semi Finals" : "Winners Semi Finals";
                } else if (rIdx === totalRounds - 3) {
                    match.label = this.type === 'single' ? "Quarter Finals" : "Winners Quarter Finals";
                }
            });
        });

        // 5. Double Elimination Generation
        if (this.type === 'double') {
            this.generateLB();
            this.generateGF();
        }

        // 6. Handle Auto-Advance for BYEs
        this.processByes();
    }

    generateLB() {
        this.lBracket = [];
        const wbRounds = this.bracket.length;
        const size = Math.pow(2, Math.ceil(Math.log2(this.teams.length)));
        
        // LB Rounds = 2 * (WB Rounds - 1)
        const lbRoundCount = Math.max(0, (wbRounds * 2) - 2);
        
        let matchCount = size / 4; 
        
        for (let r = 0; r < lbRoundCount; r++) {
            let round = [];
            // Match count halves every even round (0->1 same, 1->2 half, 2->3 same...)
            if (r > 0 && r % 2 === 0) {
                matchCount /= 2;
            }
            
            for (let i = 0; i < matchCount; i++) {
                round.push({
                    id: `lb_r${r}_m${i}`,
                    label: '',
                    p1: { name: null, score: '' },
                    p2: { name: null, score: '' },
                    winner: null
                });
            }
            this.lBracket.push(round);
        }

        // Apply Labels to Losers Bracket
        const totalLBRounds = this.lBracket.length;
        this.lBracket.forEach((round, rIdx) => {
            round.forEach(match => {
                if (rIdx === totalLBRounds - 1) {
                    match.label = "Losers Finals";
                } else if (rIdx === totalLBRounds - 2) {
                    match.label = "Losers Semi Finals";
                } else if (rIdx === totalLBRounds - 3) {
                    match.label = "Losers Quarter Finals";
                }
            });
        });
    }

    generateGF() {
        this.gfBracket = [[{
            id: `gf_m0`,
            label: 'Grand Finals',
            p1: { name: null, score: '' }, // WB Winner
            p2: { name: null, score: '' }, // LB Winner
            winner: null
        }]];
    }

    processByes() {
        this.bracket[0].forEach((match, idx) => {
            if (match.p2.name === "BYE") {
                this.advance('main', 0, idx, 'p1');
            } else if (match.p1.name === "BYE") {
                this.advance('main', 0, idx, 'p2');
            }
        });
    }

    advance(bracketType, roundIdx, matchIdx, winnerKey) {
        let bracketArr;
        if (bracketType === 'main') bracketArr = this.bracket;
        else if (bracketType === 'losers') bracketArr = this.lBracket;
        else if (bracketType === 'finals') bracketArr = this.gfBracket;

        const currentMatch = bracketArr[roundIdx][matchIdx];
        const winnerName = currentMatch[winnerKey].name;
        const loserName = winnerKey === 'p1' ? currentMatch.p2.name : currentMatch.p1.name;
        
        // Set winner
        currentMatch.winner = winnerKey; // 'p1' or 'p2'

        // 1. Advance Winner
        const nextRoundIdx = roundIdx + 1;
        if (nextRoundIdx < bracketArr.length) {
            let nextMatchIdx, targetSlot;
            
            if (bracketType === 'losers') {
                const currentCount = bracketArr[roundIdx].length;
                const nextCount = bracketArr[nextRoundIdx].length;
                
                if (currentCount === nextCount) {
                    nextMatchIdx = matchIdx;
                    targetSlot = 'p1';
                } else {
                    nextMatchIdx = Math.floor(matchIdx / 2);
                    targetSlot = (matchIdx % 2 === 0) ? 'p1' : 'p2';
                }
            } else {
                nextMatchIdx = Math.floor(matchIdx / 2);
                targetSlot = (matchIdx % 2 === 0) ? 'p1' : 'p2';
            }
            
            this.updateParticipant(bracketType, nextRoundIdx, nextMatchIdx, targetSlot, winnerName);
        } else {
            // End of bracket reached
            if (bracketType === 'main' && this.type === 'double') {
                // WB Winner -> Grand Finals P1
                this.updateParticipant('finals', 0, 0, 'p1', winnerName);
            } else if (bracketType === 'losers' && this.type === 'double') {
                // LB Winner -> Grand Finals P2
                this.updateParticipant('finals', 0, 0, 'p2', winnerName);
            }
        }

        // 2. Handle Loser Drop (Only for Main Bracket in Double Elim)
        if (bracketType === 'main' && this.type === 'double' && loserName && loserName !== "BYE") {
            this.dropLoserToLB(roundIdx, matchIdx, loserName);
        } else if (bracketType === 'main' && this.type === 'double' && loserName === "BYE") {
             // If loser is BYE, we still need to trigger the drop so the LB participant gets a BYE
             this.dropLoserToLB(roundIdx, matchIdx, "BYE");
        }

        this.render();
    }

    dropLoserToLB(wbRoundIdx, wbMatchIdx, loserName) {
        // Logic: WB R(i) -> LB R(2i - 1) for i > 0. R0 -> R0.
        let lbRoundIdx;
        if (wbRoundIdx === 0) lbRoundIdx = 0;
        else lbRoundIdx = (wbRoundIdx * 2) - 1;

        if (lbRoundIdx < this.lBracket.length) {
            let lbMatchIdx, lbSlot;
            
            if (lbRoundIdx === 0) {
                lbMatchIdx = Math.floor(wbMatchIdx / 2);
                lbSlot = (wbMatchIdx % 2 === 0) ? 'p1' : 'p2';
            } else {
                lbMatchIdx = wbMatchIdx;
                lbSlot = 'p2'; // Losers drop to bottom slot in merge rounds
            }

            this.updateParticipant('losers', lbRoundIdx, lbMatchIdx, lbSlot, loserName);
            
            // Auto-advance if the dropped loser is a BYE
            if (loserName === "BYE") {
                const match = this.lBracket[lbRoundIdx][lbMatchIdx];
                const opponentSlot = lbSlot === 'p1' ? 'p2' : 'p1';
                const opponentName = match[opponentSlot].name;
                
                if (opponentName && opponentName !== "BYE") {
                    this.advance('losers', lbRoundIdx, lbMatchIdx, opponentSlot);
                }
            } else {
                // Check if the opponent in LB was already a BYE
                const match = this.lBracket[lbRoundIdx][lbMatchIdx];
                const opponentSlot = lbSlot === 'p1' ? 'p2' : 'p1';
                if (match[opponentSlot].name === "BYE") {
                    this.advance('losers', lbRoundIdx, lbMatchIdx, lbSlot);
                }
            }
        }
    }

    updateParticipant(bracketType, rIdx, mIdx, slot, name) {
        let bracketArr;
        if (bracketType === 'main') bracketArr = this.bracket;
        else if (bracketType === 'losers') bracketArr = this.lBracket;
        else if (bracketType === 'finals') bracketArr = this.gfBracket;

        const match = bracketArr[rIdx][mIdx];
        
        // If name is different, update and reset future
        if (match[slot].name !== name) {
            match[slot].name = name;
            match[slot].score = '';
            
            // If this match had a winner, we must reset it because the participants changed
            if (match.winner) {
                this.resetFuturePath(bracketType, rIdx, mIdx);
            }
        }
    }

    resetFuturePath(bracketType, roundIdx, matchIdx) {
        let bracketArr;
        if (bracketType === 'main') bracketArr = this.bracket;
        else if (bracketType === 'losers') bracketArr = this.lBracket;
        else if (bracketType === 'finals') bracketArr = this.gfBracket;

        const match = bracketArr[roundIdx][matchIdx];
        const prevWinner = match.winner;
        match.winner = null;
        
        if (!prevWinner) return;

        const nextRoundIdx = roundIdx + 1;
        if (nextRoundIdx < bracketArr.length) {
            let nextMatchIdx, targetSlot;
            
            if (bracketType === 'losers') {
                const currentCount = bracketArr[roundIdx].length;
                const nextCount = bracketArr[nextRoundIdx].length;
                
                if (currentCount === nextCount) {
                    nextMatchIdx = matchIdx;
                    targetSlot = 'p1';
                } else {
                    nextMatchIdx = Math.floor(matchIdx / 2);
                    targetSlot = (matchIdx % 2 === 0) ? 'p1' : 'p2';
                }
            } else {
                nextMatchIdx = Math.floor(matchIdx / 2);
                targetSlot = (matchIdx % 2 === 0) ? 'p1' : 'p2';
            }

            this.updateParticipant(bracketType, nextRoundIdx, nextMatchIdx, targetSlot, null);
        } else {
            // Reset path crossing into GF
            if (bracketType === 'main' && this.type === 'double') {
                this.updateParticipant('finals', 0, 0, 'p1', null);
            } else if (bracketType === 'losers' && this.type === 'double') {
                this.updateParticipant('finals', 0, 0, 'p2', null);
            }
        }

        // If Main Bracket, also reset the Loser drop path
        if (bracketType === 'main' && this.type === 'double') {
            let lbRoundIdx;
            if (roundIdx === 0) lbRoundIdx = 0;
            else lbRoundIdx = (roundIdx * 2) - 1;

            if (lbRoundIdx < this.lBracket.length) {
                let lbMatchIdx, lbSlot;
                if (lbRoundIdx === 0) {
                    lbMatchIdx = Math.floor(matchIdx / 2);
                    lbSlot = (matchIdx % 2 === 0) ? 'p1' : 'p2';
                } else {
                    lbMatchIdx = matchIdx;
                    lbSlot = 'p2';
                }
                this.updateParticipant('losers', lbRoundIdx, lbMatchIdx, lbSlot, null);
            }
        }
    }

    resetBracket() {
        const resetArr = (arr) => {
            arr.forEach((round, rIdx) => {
                round.forEach(match => {
                    match.winner = null;
                    match.p1.score = '';
                    match.p2.score = '';
                    // Clear names only if not the initial setup rounds
                    if (arr === this.bracket && rIdx > 0) {
                        match.p1.name = null;
                        match.p2.name = null;
                    } else if (arr !== this.bracket) {
                        match.p1.name = null;
                        match.p2.name = null;
                    }
                });
            });
        };

        resetArr(this.bracket);
        resetArr(this.lBracket);
        resetArr(this.gfBracket);
        
        this.processByes();
        this.render();
    }

    render() {
        this.container.innerHTML = '';

        const renderSection = (bracketData, title, type) => {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'bracket-section';
            if(title) {
                const h3 = document.createElement('h3');
                h3.textContent = title;
                h3.style.color = '#888';
                h3.style.marginLeft = '20px';
                sectionDiv.appendChild(h3);
            }
            
            const roundsContainer = document.createElement('div');
            roundsContainer.className = 'bracket-container';
            
            bracketData.forEach((round, rIdx) => {
                const roundEl = document.createElement('div');
                roundEl.className = 'round';
                
                round.forEach((match, mIdx) => {
                    const matchEl = document.createElement('div');
                    matchEl.className = 'match';

                    // Metadata for delegation
                    matchEl.dataset.bracketType = type;
                    matchEl.dataset.rIdx = rIdx;
                    matchEl.dataset.mIdx = mIdx;
                    matchEl.draggable = true;

                    // Visibility logic
                    const isBye = match.p1.name === "BYE" || match.p2.name === "BYE";
                    const bothBye = match.p1.name === "BYE" && match.p2.name === "BYE";
                    
                    if (type === 'main' && rIdx === 0 && isBye) {
                         matchEl.style.visibility = 'hidden';
                    } else if (bothBye) {
                         matchEl.style.visibility = 'hidden';
                    }

                    const labelInput = document.createElement('input');
                    labelInput.className = 'match-label';
                    labelInput.value = match.label || '';
                    labelInput.placeholder = 'Match';
                    matchEl.appendChild(labelInput);

                    matchEl.appendChild(this.createParticipantEl(match, 'p1', rIdx, mIdx, type));
                    matchEl.appendChild(this.createParticipantEl(match, 'p2', rIdx, mIdx, type));
                    
                    roundEl.appendChild(matchEl);
                });
                roundsContainer.appendChild(roundEl);
            });
            sectionDiv.appendChild(roundsContainer);
            this.container.appendChild(sectionDiv);
        };

        renderSection(this.bracket, "Winners Bracket", 'main');
        
        if (this.type === 'double') {
            renderSection(this.lBracket, "Losers Bracket", 'losers');
            renderSection(this.gfBracket, "Grand Finals", 'finals');
        }
    }

    createParticipantEl(match, slotKey, rIdx, mIdx, bracketType) {
        const data = match[slotKey];
        const el = document.createElement('div');
        el.className = 'participant';
        el.dataset.slotKey = slotKey;
        el.draggable = true;

        if (match.winner === slotKey) el.classList.add('winner');
        if (match.winner && match.winner !== slotKey) el.classList.add('loser');

        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = data.name || '...';
        
        const scoreInput = document.createElement('input');
        scoreInput.className = 'score';
        scoreInput.value = data.score;
        scoreInput.placeholder = '-';

        el.appendChild(nameSpan);
        if (data.name && data.name !== "BYE") el.appendChild(scoreInput);
        
        return el;
    }

    swapTeams(source, target) {
        const sourceArr = this.getBracketArray(source.bracketType);
        const targetArr = this.getBracketArray(target.bracketType);

        const sourceData = sourceArr[source.rIdx][source.mIdx][source.slotKey];
        const targetData = targetArr[target.rIdx][target.mIdx][target.slotKey];

        // Swap names
        const tempName = sourceData.name;
        sourceData.name = targetData.name;
        targetData.name = tempName;

        // Reset future paths for both matches involved to ensure consistency
        this.resetFuturePath(source.bracketType, source.rIdx, source.mIdx);
        this.resetFuturePath(target.bracketType, target.rIdx, target.mIdx);

        // Re-process byes in case a BYE was moved
        this.processByes();
        this.render();
    }

    swapMatches(source, target) {
        const arr = this.getBracketArray(source.bracketType);
        const sourceMatch = arr[source.rIdx][source.mIdx];
        const targetMatch = arr[target.rIdx][target.mIdx];

        // Swap content
        const tempP1 = sourceMatch.p1;
        const tempP2 = sourceMatch.p2;
        const tempLabel = sourceMatch.label;
        const tempWinner = sourceMatch.winner;

        sourceMatch.p1 = targetMatch.p1;
        sourceMatch.p2 = targetMatch.p2;
        sourceMatch.label = targetMatch.label;
        sourceMatch.winner = targetMatch.winner;

        targetMatch.p1 = tempP1;
        targetMatch.p2 = tempP2;
        targetMatch.label = tempLabel;
        targetMatch.winner = tempWinner;

        // Reset future paths because the flow changes
        this.resetFuturePath(source.bracketType, source.rIdx, source.mIdx);
        this.resetFuturePath(target.bracketType, target.rIdx, target.mIdx);
        
        this.processByes();
        this.render();
    }

    renderSidebar() {
        const list = document.getElementById('sidebar-list');
        list.innerHTML = '';
        this.teams.forEach(team => {
            const el = document.createElement('div');
            el.className = 'sidebar-item';
            el.textContent = team;
            el.draggable = true;
            list.appendChild(el);
        });
    }

    setFloatingDragImage(e, el) {
        const rect = el.getBoundingClientRect();
        const ghost = el.cloneNode(true);
        
        const style = window.getComputedStyle(el);
        ghost.style.width = style.width;
        ghost.style.height = style.height;
        ghost.style.backgroundColor = style.backgroundColor !== 'rgba(0, 0, 0, 0)' ? style.backgroundColor : '#2f3542';
        ghost.style.color = style.color;
        
        const originalInputs = el.querySelectorAll('input');
        const ghostInputs = ghost.querySelectorAll('input');
        originalInputs.forEach((input, i) => {
            ghostInputs[i].value = input.value;
        });

        ghost.style.position = "absolute";
        ghost.style.top = "-1000px";
        ghost.style.left = "-1000px";
        ghost.style.zIndex = "9999";
        ghost.style.opacity = "0.9";
        ghost.style.transform = "scale(1.05) rotate(3deg)";
        ghost.style.boxShadow = "0 15px 30px rgba(0,0,0,0.5)";
        ghost.style.borderRadius = "4px";
        ghost.style.pointerEvents = "none";
        
        document.body.appendChild(ghost);
        
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        
        e.dataTransfer.setDragImage(ghost, offsetX, offsetY);
        
        setTimeout(() => document.body.removeChild(ghost), 0);
    }

    fitToScreen() {
        const wrapper = this.bracketView.querySelector('.bracket-scroll-wrapper');
        
        // Reset transform to get accurate natural dimensions
        this.container.style.transform = 'scale(1)';
        
        const contentWidth = this.container.scrollWidth;
        const contentHeight = this.container.scrollHeight;
        const viewWidth = wrapper.clientWidth;
        const viewHeight = wrapper.clientHeight;

        const scale = Math.min(viewWidth / contentWidth, viewHeight / contentHeight, 1);
        
        // Apply scale with a slight padding factor (0.95)
        this.container.style.transform = `scale(${scale * 0.95})`;
    }

    async shareBracket() {
        const state = this.serializeState();
        const json = JSON.stringify(state);
        // Encode to Base64, handling Unicode strings safely
        const encoded = btoa(encodeURIComponent(json));
        const url = window.location.href.split('#')[0] + '#' + encoded;
        
        const shareData = {
            title: document.getElementById('tournament-title-display').textContent,
            text: 'Check out my tournament bracket!',
            url: url
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                // User cancelled share
            }
        } else {
            try {
                await navigator.clipboard.writeText(url);
                alert('Bracket URL copied to clipboard!');
            } catch (err) {
                alert('Could not copy URL automatically. Please copy the URL from the address bar.');
                window.location.hash = encoded;
            }
        }
    }

    serializeState() {
        const matches = [];
        const collect = (arr, type) => {
            if (!arr) return;
            arr.forEach((round, rIdx) => {
                round.forEach((match, mIdx) => {
                    // Only save matches that have data (winner, scores, or custom label)
                    if (match.winner || match.p1.score || match.p2.score || match.label) {
                        matches.push({
                            type, rIdx, mIdx,
                            w: match.winner,
                            s1: match.p1.score,
                            s2: match.p2.score,
                            l: match.label
                        });
                    }
                });
            });
        };
        
        collect(this.bracket, 'main');
        collect(this.lBracket, 'losers');
        collect(this.gfBracket, 'finals');

        return {
            nm: document.getElementById('tournament-name').value,
            tms: this.teams,
            tp: this.type,
            ms: matches
        };
    }

    checkSharedState() {
        if (window.location.hash && window.location.hash.length > 1) {
            try {
                const encoded = window.location.hash.substring(1);
                const json = decodeURIComponent(atob(encoded));
                const state = JSON.parse(json);
                
                // Restore Setup
                document.getElementById('tournament-name').value = state.nm || '';
                document.getElementById('team-input').value = state.tms.join('\n');
                document.getElementById('bracket-type').value = state.tp;
                
                // Generate Structure
                this.init();
                
                // Restore Match Results
                // We iterate and apply results. Because matches are saved in order (Round 0, 1...),
                // advancing winners will correctly propagate to subsequent rounds.
                state.ms.forEach(m => {
                    const arr = this.getBracketArray(m.type);
                    if (arr && arr[m.rIdx] && arr[m.rIdx][m.mIdx]) {
                        const match = arr[m.rIdx][m.mIdx];
                        match.p1.score = m.s1 || '';
                        match.p2.score = m.s2 || '';
                        if (m.l) match.label = m.l;
                        
                        if (m.w) {
                            this.advance(m.type, m.rIdx, m.mIdx, m.w);
                        }
                    }
                });
                
                this.render();
            } catch (e) {
                console.error('Failed to load shared state:', e);
            }
        }
    }
}

new BracketManager();