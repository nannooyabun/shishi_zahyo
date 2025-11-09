// ========================================
// 座標管理システム - 共通JavaScript
// ========================================

// ========================================
// Firebase設定と初期化
// ========================================
const firebaseConfig = {
    apiKey: "AIzaSyAoN96jdkx9kVm0mfj50n-5WzZOkLzGJVI",
    authDomain: "shishi-zahyo.firebaseapp.com",
    databaseURL: "https://shishi-zahyo-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "shishi-zahyo",
    storageBucket: "shishi-zahyo.firebasestorage.app",
    messagingSenderId: "380340912647",
    appId: "1:380340912647:web:d20e62f51ed9dc590560a2",
    measurementId: "G-NQ0482B0YC"
};

// Firebase初期化
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Firebaseデータ参照
const coordinatesRef = database.ref('coordinates');
const groupsRef = database.ref('groups');
const obstaclesRef = database.ref('obstacles');

// ========================================
// グローバル定数
// ========================================

// ゲーム全体の座標範囲
const worldBounds = {
    minX: 0,
    maxX: 700,
    minY: 0,
    maxY: 1900
};

// 一級地帯の範囲
const primeZone = {
    minX: 200,
    maxX: 439,
    minY: 760,
    maxY: 999
};

// 城の固定データ
const castles = [
    { name: '二条城', x: 320, y: 880 },
    { name: '雑賀城', x: 416, y: 785 },
    { name: '後瀬山城', x: 220, y: 860 },
    { name: '伊賀上野城', x: 388, y: 949 }
];

// 障害物の名前
const obstacleNames = {
    'rock': '🪨 岩'
};

// カスタム障害物用の色パレット
const colorPalette = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#AAB7B8',
    '#FF8ED4', '#00D2FF', '#3F51B5', '#E91E63', '#009688'
];

// ========================================
// グローバル変数
// ========================================

// Canvas要素（各ページで初期化される）
let canvas = null;
let ctx = null;

// 描画設定
let scale = 5;
let offsetX = (primeZone.minX + primeZone.maxX) / 2;
let offsetY = (primeZone.minY + primeZone.maxY) / 2;
let gridType = 'square';

// データ
let parsedCoordinates = [];
let savedCoordinates = [];
let selectedCoordinateIds = new Set();
let hiddenCoordinateIds = new Set();
let duplicateCoordinateIds = new Set();
let coordinateGroups = [];
let filteredCoordinates = [];
let obstacles = [];
let selectedObstacleIds = new Set();
let customObstacles = [];

// UI状態
let currentMode = 'view';
let selectedObstacleType = null;
let tempSelection = new Set();
let isCreatingCustomObstacle = false;
let customObstacleInProgress = null;
let rangeSelectMode = false;
let isFilterActive = false;
let rangeSelectStart = null;
let expandedGroupId = null;
let groupFilterActive = false;

// ドラッグ選択用
let isDragging = false;
let dragStartCell = null;
let dragCurrentCell = null;

// 座標調整モード用
let adjustMode = {
    active: false,
    groupName: '',
    coordinates: []
};
let draggedCoordinate = null;

// タッチ操作用
let touches = [];
let lastTouchDistance = 0;
let isPanning = false;
let lastPanPos = null;
let isSpaceKeyPressed = false;

// グループ編集用
let editingGroupId = null;
let editGroupSelectedCoordIds = new Set();

// ========================================
// Canvas初期化関数
// ========================================
function initCanvas(canvasId) {
    canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error('Canvas element not found:', canvasId);
        return false;
    }
    ctx = canvas.getContext('2d');
    return true;
}

// ========================================
// ユーティリティ関数
// ========================================

// ローカルタイムゾーンで日付文字列を取得
function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 座標を正規化（@付きでも付きなしでも処理）
function normalizeCoordinate(coord) {
    if (!coord) return { x: null, y: null };
    const str = coord.toString().replace('@', '').trim();
    const parts = str.split(/\s+/);
    if (parts.length === 2) {
        return {
            x: parseInt(parts[0]),
            y: parseInt(parts[1])
        };
    }
    return { x: null, y: null };
}

// 2つの座標が同じかチェック
function isSameCoordinate(coord1, coord2) {
    const c1 = normalizeCoordinate(coord1);
    const c2 = normalizeCoordinate(coord2);
    return c1.x === c2.x && c1.y === c2.y;
}

// ========================================
// 座標変換関数
// ========================================

// ワールド座標からスクリーン座標へ
function worldToScreen(x, y) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    if (gridType === 'diamond') {
        const dx = x - offsetX;
        const dy = y - offsetY;

        const screenX = width / 2 + (dx + dy) * scale / 2;
        const screenY = height / 2 + (dx - dy) * scale * 0.876 / 2;

        return { x: screenX, y: screenY };
    } else {
        return {
            x: width / 2 + (y - offsetY) * scale,
            y: height / 2 + (x - offsetX) * scale
        };
    }
}

// スクリーン座標からワールド座標へ
function screenToWorld(screenX, screenY) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    if (gridType === 'diamond') {
        const sx = (screenX - width / 2) / scale * 2;
        const sy = (screenY - height / 2) / scale / 0.876 * 2;

        const worldX = offsetX + (sx + sy) / 2;
        const worldY = offsetY + (sx - sy) / 2;

        return {
            x: Math.round(worldX),
            y: Math.round(worldY)
        };
    } else {
        return {
            x: Math.round(offsetX + (screenY - height / 2) / scale),
            y: Math.round(offsetY + (screenX - width / 2) / scale)
        };
    }
}

// スクリーン座標の移動量をワールド座標の移動量に変換（ひし形モード用）
function screenToWorldDelta(screenDelta) {
    if (gridType === 'diamond') {
        const sx = screenDelta.x / scale * 2;
        const sy = screenDelta.y / scale / 0.876 * 2;

        return {
            x: (sx + sy) / 2,
            y: (sx - sy) / 2
        };
    } else {
        return {
            x: screenDelta.y / scale,
            y: screenDelta.x / scale
        };
    }
}

// ========================================
// マップ描画関数
// ========================================

// キャンバスのリサイズ
function resizeCanvas() {
    if (!canvas) return;
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();

    const dpr = window.devicePixelRatio || 1;

    // 全画面表示時は画面サイズを使用
    let displayWidth, displayHeight;
    if (document.fullscreenElement) {
        displayWidth = window.innerWidth;
        displayHeight = window.innerHeight;
    } else {
        // 通常表示時は、固定配置でない要素の高さのみ計算
        // position: absolute の要素（グリッド切替、ズームボタン、全画面ボタン、座標表示）は
        // Canvasの上に重なるので計算から除外
        const h2 = container.querySelector('h2');

        let occupiedHeight = 0;
        if (h2) occupiedHeight += h2.offsetHeight + 15; // margin-bottom含む

        // コンテナのパディング（上下20px × 2 = 40px）
        const containerPadding = 40;

        // 利用可能なスペースを計算
        const availableWidth = rect.width - containerPadding;
        const availableHeight = rect.height - containerPadding - occupiedHeight;

        // 正方形を維持しつつ、利用可能なスペースを最大限活用
        const maxSize = Math.min(availableWidth, availableHeight);

        displayWidth = maxSize > 0 ? maxSize : 400; // 最小サイズ確保
        displayHeight = maxSize > 0 ? maxSize : 400;
    }

    // canvas.width/heightの設定でコンテキストは自動リセットされる
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';

    // DPRスケールを適用
    ctx.scale(dpr, dpr);

    drawMap();
}

// メイン描画関数
function drawMap() {
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.clearRect(0, 0, width, height);

    // 背景
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, width, height);

    // 一級地帯の背景
    drawPrimeZoneBackground();

    // グリッド描画
    if (gridType === 'diamond') {
        drawDiamondGrid();
    } else {
        drawSquareGrid();
    }

    // 城の描画
    castles.forEach(castle => {
        drawCastle(castle);
    });

    // 障害物描画
    drawObstacles();

    // 保存済み座標描画
    drawSavedCoordinates();

    // 座標調整モード
    drawAdjustModeCoordinates();

    // ドラッグ選択
    drawDragSelection();

    // 範囲選択
    drawRangeSelection();

    // 中央座標表示更新
    updateCenterCoordDisplay();
}

// 正方形グリッド描画
function drawSquareGrid() {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.lineWidth = 1;

    const visibleMinX = Math.floor(offsetX - height / scale / 2);
    const visibleMaxX = Math.ceil(offsetX + height / scale / 2);
    const visibleMinY = Math.floor(offsetY - width / scale / 2);
    const visibleMaxY = Math.ceil(offsetY + width / scale / 2);

    // 1マスごとの細い線と10マスごとの太い線を描画
    for (let x = Math.max(worldBounds.minX, visibleMinX); x <= Math.min(worldBounds.maxX, visibleMaxX) + 1; x++) {
        const pos1 = worldToScreen(x, visibleMinY);
        const pos2 = worldToScreen(x, visibleMaxY);

        ctx.strokeStyle = x % 10 === 0 ? '#888' : '#d0d0d0';
        ctx.lineWidth = x % 10 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.floor(pos1.x) + 0.5, Math.floor(pos1.y) + 0.5);
        ctx.lineTo(Math.floor(pos2.x) + 0.5, Math.floor(pos2.y) + 0.5);
        ctx.stroke();
    }

    for (let y = Math.max(worldBounds.minY, visibleMinY); y <= Math.min(worldBounds.maxY, visibleMaxY) + 1; y++) {
        const pos1 = worldToScreen(visibleMinX, y);
        const pos2 = worldToScreen(visibleMaxX, y);

        ctx.strokeStyle = y % 10 === 0 ? '#888' : '#d0d0d0';
        ctx.lineWidth = y % 10 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.floor(pos1.x) + 0.5, Math.floor(pos1.y) + 0.5);
        ctx.lineTo(Math.floor(pos2.x) + 0.5, Math.floor(pos2.y) + 0.5);
        ctx.stroke();
    }

    // 一級地帯の枠を強調
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3;
    const topLeft = worldToScreen(primeZone.minX, primeZone.minY);
    const topRight = worldToScreen(primeZone.minX, primeZone.maxY + 1);
    const bottomRight = worldToScreen(primeZone.maxX + 1, primeZone.maxY + 1);
    const bottomLeft = worldToScreen(primeZone.maxX + 1, primeZone.minY);

    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(topRight.x, topRight.y);
    ctx.lineTo(bottomRight.x, bottomRight.y);
    ctx.lineTo(bottomLeft.x, bottomLeft.y);
    ctx.closePath();
    ctx.stroke();
}

// ひし形グリッド描画
function drawDiamondGrid() {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.lineWidth = 1;

    const visibleRange = Math.max(width, height) / scale + 50;
    const visibleMinX = Math.floor(offsetX - visibleRange);
    const visibleMaxX = Math.ceil(offsetX + visibleRange);
    const visibleMinY = Math.floor(offsetY - visibleRange);
    const visibleMaxY = Math.ceil(offsetY + visibleRange);

    // グリッド線を描画
    for (let x = Math.max(worldBounds.minX, visibleMinX); x <= Math.min(worldBounds.maxX, visibleMaxX) + 1; x++) {
        for (let y = Math.max(worldBounds.minY, visibleMinY); y <= Math.min(worldBounds.maxY, visibleMaxY) + 1; y++) {
            const pos = worldToScreen(x, y);

            if (pos.x < -100 || pos.x > width + 100 || pos.y < -100 || pos.y > height + 100) {
                continue;
            }

            ctx.strokeStyle = (x % 10 === 0 || y % 10 === 0) ? '#888' : '#d0d0d0';
            ctx.lineWidth = (x % 10 === 0 || y % 10 === 0) ? 2 : 1;

            // 右方向の線
            if (y <= Math.min(worldBounds.maxY, visibleMaxY)) {
                const posRight = worldToScreen(x, y + 1);
                ctx.beginPath();
                ctx.moveTo(Math.floor(pos.x) + 0.5, Math.floor(pos.y) + 0.5);
                ctx.lineTo(Math.floor(posRight.x) + 0.5, Math.floor(posRight.y) + 0.5);
                ctx.stroke();
            }

            // 下方向の線
            if (x <= Math.min(worldBounds.maxX, visibleMaxX)) {
                const posDown = worldToScreen(x + 1, y);
                ctx.beginPath();
                ctx.moveTo(Math.floor(pos.x) + 0.5, Math.floor(pos.y) + 0.5);
                ctx.lineTo(Math.floor(posDown.x) + 0.5, Math.floor(posDown.y) + 0.5);
                ctx.stroke();
            }
        }
    }

    // 一級地帯の枠を強調
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3;
    const topLeft = worldToScreen(primeZone.minX, primeZone.minY);
    const topRight = worldToScreen(primeZone.minX, primeZone.maxY + 1);
    const bottomRight = worldToScreen(primeZone.maxX + 1, primeZone.maxY + 1);
    const bottomLeft = worldToScreen(primeZone.maxX + 1, primeZone.minY);

    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(topRight.x, topRight.y);
    ctx.lineTo(bottomRight.x, bottomRight.y);
    ctx.lineTo(bottomLeft.x, bottomLeft.y);
    ctx.closePath();
    ctx.stroke();
}

// 一級地帯の背景描画
function drawPrimeZoneBackground() {
    if (gridType === 'diamond') {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
        ctx.beginPath();

        const topLeft = worldToScreen(primeZone.minX, primeZone.minY);
        const topRight = worldToScreen(primeZone.minX, primeZone.maxY + 1);
        const bottomRight = worldToScreen(primeZone.maxX + 1, primeZone.maxY + 1);
        const bottomLeft = worldToScreen(primeZone.maxX + 1, primeZone.minY);

        ctx.moveTo(topLeft.x, topLeft.y);
        ctx.lineTo(topRight.x, topRight.y);
        ctx.lineTo(bottomRight.x, bottomRight.y);
        ctx.lineTo(bottomLeft.x, bottomLeft.y);
        ctx.closePath();
        ctx.fill();
    } else {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
        const pos1 = worldToScreen(primeZone.minX, primeZone.minY);
        const pos2 = worldToScreen(primeZone.maxX + 1, primeZone.maxY + 1);
        const width = pos2.x - pos1.x;
        const height = pos2.y - pos1.y;
        ctx.fillRect(pos1.x, pos1.y, width, height);
    }
}

// セル描画（正方形 or ひし形）
function drawCell(x, y, color) {
    if (gridType === 'diamond') {
        drawDiamondCell(x, y, color);
    } else {
        drawSquareCell(x, y, color);
    }
}

// 正方形セル描画
function drawSquareCell(x, y, color) {
    const topLeft = worldToScreen(x, y);
    const bottomRight = worldToScreen(x + 1, y + 1);
    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;

    ctx.fillStyle = color;
    ctx.fillRect(topLeft.x, topLeft.y, width, height);
}

// ひし形セル描画
function drawDiamondCell(x, y, color) {
    const topLeft = worldToScreen(x, y);
    const topRight = worldToScreen(x, y + 1);
    const bottomRight = worldToScreen(x + 1, y + 1);
    const bottomLeft = worldToScreen(x + 1, y);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(topRight.x, topRight.y);
    ctx.lineTo(bottomRight.x, bottomRight.y);
    ctx.lineTo(bottomLeft.x, bottomLeft.y);
    ctx.closePath();
    ctx.fill();
}

// 城の描画
function drawCastle(castle) {
    const { x, y, name } = castle;

    // 城の9×9マス（濃い紫）
    for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
            drawCell(x + dx, y + dy, 'rgba(128, 0, 128, 0.6)');
        }
    }

    // 防衛帯（外側4マス、薄い紫）
    for (let dx = -8; dx <= 8; dx++) {
        for (let dy = -8; dy <= 8; dy++) {
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                drawCell(x + dx, y + dy, 'rgba(200, 150, 200, 0.3)');
            }
        }
    }

    // 城の名前を表示
    const screenPos = worldToScreen(x, y);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 3;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, screenPos.x, screenPos.y);
    ctx.restore();

    // 城の中心マーカー
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// 障害物を描画
function drawObstacles() {
    obstacles.forEach(obstacle => {
        obstacle.cells.forEach(cellKey => {
            const [x, y] = cellKey.split(',').map(Number);
            const pos = worldToScreen(x, y);
            const size = scale * 0.8;

            if (obstacle.type === 'rock') {
                ctx.fillStyle = selectedObstacleIds.has(obstacle.id) ? '#8B4513' : '#A0522D';
            } else if (obstacle.type === 'custom') {
                ctx.fillStyle = obstacle.color || '#666';
            }

            if (gridType === 'diamond') {
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y - size / 2);
                ctx.lineTo(pos.x + size / 2, pos.y);
                ctx.lineTo(pos.x, pos.y + size / 2);
                ctx.lineTo(pos.x - size / 2, pos.y);
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
            }
        });
    });

    // 選択中の一時セル
    tempSelection.forEach(cellKey => {
        const [x, y] = cellKey.split(',').map(Number);
        const pos = worldToScreen(x, y);
        const size = scale * 0.8;
        ctx.fillStyle = 'rgba(135, 69, 19, 0.5)';
        if (gridType === 'diamond') {
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y - size / 2);
            ctx.lineTo(pos.x + size / 2, pos.y);
            ctx.lineTo(pos.x, pos.y + size / 2);
            ctx.lineTo(pos.x - size / 2, pos.y);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
        }
    });
}

// 保存済み座標を描画
function drawSavedCoordinates() {
    const coordsToDisplay = isFilterActive ? filteredCoordinates : savedCoordinates;

    coordsToDisplay.forEach(coord => {
        if (hiddenCoordinateIds.has(coord.id)) return;
        if (draggedCoordinate && draggedCoordinate.id === coord.id) return;

        const pos = worldToScreen(coord.x, coord.y);
        const isSelected = selectedCoordinateIds.has(coord.id);
        const isDuplicate = duplicateCoordinateIds.has(coord.id);

        ctx.fillStyle = isDuplicate ? '#ff9800' : (isSelected ? '#4caf50' : '#2196f3');
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
        ctx.fill();

        if (scale > 3) {
            ctx.fillStyle = '#000';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(coord.name, pos.x, pos.y - 10);
        }
    });
}

// 座標調整モードの座標を描画
function drawAdjustModeCoordinates() {
    if (!adjustMode.active) return;

    adjustMode.coordinates.forEach(coord => {
        const pos = worldToScreen(coord.x, coord.y);
        ctx.fillStyle = '#9c27b0';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
        ctx.fill();
        if (scale > 3) {
            ctx.fillStyle = '#000';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(coord.name, pos.x, pos.y - 12);
        }
    });

    if (draggedCoordinate) {
        const pos = worldToScreen(draggedCoordinate.x, draggedCoordinate.y);
        ctx.fillStyle = 'rgba(156, 39, 176, 0.5)';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ドラッグ選択範囲を描画
function drawDragSelection() {
    if (!isDragging || !dragStartCell || !dragCurrentCell) return;

    const minX = Math.min(dragStartCell.x, dragCurrentCell.x);
    const maxX = Math.max(dragStartCell.x, dragCurrentCell.x);
    const minY = Math.min(dragStartCell.y, dragCurrentCell.y);
    const maxY = Math.max(dragStartCell.y, dragCurrentCell.y);

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            const pos = worldToScreen(x, y);
            const size = scale * 0.9;
            ctx.fillStyle = 'rgba(33, 150, 243, 0.3)';
            if (gridType === 'diamond') {
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y - size / 2);
                ctx.lineTo(pos.x + size / 2, pos.y);
                ctx.lineTo(pos.x, pos.y + size / 2);
                ctx.lineTo(pos.x - size / 2, pos.y);
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
            }
        }
    }
}

// 範囲選択を描画
function drawRangeSelection() {
    if (!rangeSelectMode || !rangeSelectStart) return;
    // 範囲選択の視覚化（省略可能）
}

// 中央座標表示を更新
function updateCenterCoordDisplay() {
    const display = document.getElementById('centerCoordDisplay');
    if (display) {
        const centerX = Math.round(offsetX);
        const centerY = Math.round(offsetY);
        display.textContent = `中央: @${centerX} ${centerY}`;
    }
}

// ========================================
// グリッドタイプ変更
// ========================================
function changeGridType(type) {
    gridType = type;
    drawMap();
}

// ========================================
// ズーム・パン機能
// ========================================
function zoomIn() {
    scale = Math.min(scale * 1.5, 100);
    drawMap();
}

function zoomOut() {
    scale = Math.max(scale / 1.5, 0.5);
    drawMap();
}

function jumpToPrimeZone() {
    offsetX = (primeZone.minX + primeZone.maxX) / 2;
    offsetY = (primeZone.minY + primeZone.maxY) / 2;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    // 一級地帯全体が表示されるようにスケールを計算
    scale = Math.min(
        width / (primeZone.maxY - primeZone.minY + 20),
        height / (primeZone.maxX - primeZone.minX + 20)
    );

    drawMap();
}

// ========================================
// 座標ジャンプダイアログ
// ========================================
function openJumpDialog() {
    const dialog = document.getElementById('jumpDialog');
    if (dialog) {
        dialog.style.display = 'flex';
        document.getElementById('jumpDialogX').value = Math.round(offsetX);
        document.getElementById('jumpDialogY').value = Math.round(offsetY);
    }
}

function closeJumpDialog() {
    const dialog = document.getElementById('jumpDialog');
    if (dialog) {
        dialog.style.display = 'none';
    }
}

function executeJump() {
    const x = parseInt(document.getElementById('jumpDialogX').value);
    const y = parseInt(document.getElementById('jumpDialogY').value);

    if (isNaN(x) || isNaN(y)) {
        alert('X座標とY座標を入力してください');
        return;
    }

    offsetX = x;
    offsetY = y;
    scale = Math.max(scale, 10);
    drawMap();
    closeJumpDialog();
}

// ========================================
// 全画面表示
// ========================================
function toggleFullscreen() {
    const section = document.querySelector('.map-section');
    const btn = document.getElementById('fullscreenBtn');

    if (!section) {
        alert('マップセクションが見つかりません');
        return;
    }

    if (!document.fullscreenElement) {
        section.requestFullscreen().then(() => {
            section.classList.add('fullscreen-container');
            if (btn) btn.textContent = '✕ 全画面解除';
        }).catch(err => {
            console.error('全画面表示エラー:', err);
            alert('全画面表示に失敗しました');
        });
    } else {
        document.exitFullscreen().then(() => {
            section.classList.remove('fullscreen-container');
            if (btn) btn.textContent = '🖼️ 全画面表示';
        });
    }
}

// 全画面変更イベントをリッスン
document.addEventListener('fullscreenchange', () => {
    const section = document.querySelector('.map-section');
    if (!document.fullscreenElement && section) {
        section.classList.remove('fullscreen-container');
        const btn = document.getElementById('fullscreenBtn');
        if (btn) btn.textContent = '🖼️ 全画面表示';
    }
    // 全画面解除時は少し待ってからリサイズ（レイアウトの再計算を待つ）
    setTimeout(() => {
        resizeCanvas();
    }, 150);
});

// ========================================
// 初期化処理（各ページで呼び出す）
// ========================================
function initCommon(canvasId) {
    console.log('共通機能を初期化中...');

    if (!initCanvas(canvasId)) {
        return false;
    }

    // ウィンドウリサイズイベント
    window.addEventListener('resize', resizeCanvas);

    // 初回リサイズ
    resizeCanvas();

    console.log('共通機能の初期化完了');
    return true;
}
