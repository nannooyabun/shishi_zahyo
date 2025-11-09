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
function worldToScreen(wx, wy) {
    if (gridType === 'diamond') {
        const cx = offsetX;
        const cy = offsetY;
        const dx = wy - cy;
        const dy = wx - cx;
        const sx = canvas.width / 2 + dx * scale;
        const sy = canvas.height / 2 + dy * scale;
        return { x: sx, y: sy };
    } else {
        const sx = canvas.width / 2 + (wy - offsetY) * scale;
        const sy = canvas.height / 2 + (wx - offsetX) * scale;
        return { x: sx, y: sy };
    }
}

// スクリーン座標からワールド座標へ
function screenToWorld(sx, sy) {
    if (gridType === 'diamond') {
        const dx = sx - canvas.width / 2;
        const dy = sy - canvas.height / 2;
        const wx = offsetX + dy / scale;
        const wy = offsetY + dx / scale;
        return { x: Math.round(wx), y: Math.round(wy) };
    } else {
        const wx = offsetX + (sy - canvas.height / 2) / scale;
        const wy = offsetY + (sx - canvas.width / 2) / scale;
        return { x: Math.round(wx), y: Math.round(wy) };
    }
}

// スクリーン座標の移動量をワールド座標の移動量に変換（ひし形モード用）
function screenToWorldDelta(screenDelta) {
    const dx = screenDelta.x;
    const dy = screenDelta.y;
    return {
        x: dy / scale,
        y: dx / scale
    };
}

// ========================================
// マップ描画関数
// ========================================

// キャンバスのリサイズ
function resizeCanvas() {
    if (!canvas) return;
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    drawMap();
}

// メイン描画関数
function drawMap() {
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gridType === 'diamond') {
        drawDiamondGrid();
    } else {
        drawSquareGrid();
    }

    drawCastles();
    drawObstacles();
    drawSavedCoordinates();
    drawAdjustModeCoordinates();
    drawDragSelection();
    drawRangeSelection();
    updateCenterCoordDisplay();
}

// 正方形グリッド描画
function drawSquareGrid() {
    const minX = Math.floor(offsetX - canvas.height / (2 * scale));
    const maxX = Math.ceil(offsetX + canvas.height / (2 * scale));
    const minY = Math.floor(offsetY - canvas.width / (2 * scale));
    const maxY = Math.ceil(offsetY + canvas.width / (2 * scale));

    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;

    for (let x = minX; x <= maxX; x++) {
        const p1 = worldToScreen(x, minY);
        const p2 = worldToScreen(x, maxY);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }

    for (let y = minY; y <= maxY; y++) {
        const p1 = worldToScreen(minX, y);
        const p2 = worldToScreen(maxX, y);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }

    // 一級地帯を強調
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3;
    const primeCorners = [
        worldToScreen(primeZone.minX, primeZone.minY),
        worldToScreen(primeZone.minX, primeZone.maxY),
        worldToScreen(primeZone.maxX, primeZone.maxY),
        worldToScreen(primeZone.maxX, primeZone.minY)
    ];
    ctx.beginPath();
    ctx.moveTo(primeCorners[0].x, primeCorners[0].y);
    ctx.lineTo(primeCorners[1].x, primeCorners[1].y);
    ctx.lineTo(primeCorners[2].x, primeCorners[2].y);
    ctx.lineTo(primeCorners[3].x, primeCorners[3].y);
    ctx.closePath();
    ctx.stroke();

    // 10マスごとに太線
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    for (let x = Math.floor(minX / 10) * 10; x <= maxX; x += 10) {
        const p1 = worldToScreen(x, minY);
        const p2 = worldToScreen(x, maxY);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }
    for (let y = Math.floor(minY / 10) * 10; y <= maxY; y += 10) {
        const p1 = worldToScreen(minX, y);
        const p2 = worldToScreen(maxX, y);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }
}

// ひし形グリッド描画
function drawDiamondGrid() {
    const screenCenterX = canvas.width / 2;
    const screenCenterY = canvas.height / 2;
    const maxDist = Math.max(canvas.width, canvas.height);
    const range = Math.ceil(maxDist / scale) + 2;

    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;

    // グリッド線を描画
    for (let i = -range; i <= range; i++) {
        const wx1 = offsetX + i;
        const wy1 = offsetY - range;
        const wy2 = offsetY + range;
        const p1 = worldToScreen(wx1, wy1);
        const p2 = worldToScreen(wx1, wy2);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const wx2 = offsetX - range;
        const wx3 = offsetX + range;
        const wy3 = offsetY + i;
        const p3 = worldToScreen(wx2, wy3);
        const p4 = worldToScreen(wx3, wy3);
        ctx.beginPath();
        ctx.moveTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.stroke();
    }

    // 一級地帯を強調
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3;
    const primeCorners = [
        worldToScreen(primeZone.minX, primeZone.minY),
        worldToScreen(primeZone.minX, primeZone.maxY),
        worldToScreen(primeZone.maxX, primeZone.maxY),
        worldToScreen(primeZone.maxX, primeZone.minY)
    ];
    ctx.beginPath();
    ctx.moveTo(primeCorners[0].x, primeCorners[0].y);
    ctx.lineTo(primeCorners[1].x, primeCorners[1].y);
    ctx.lineTo(primeCorners[2].x, primeCorners[2].y);
    ctx.lineTo(primeCorners[3].x, primeCorners[3].y);
    ctx.closePath();
    ctx.stroke();

    // 10マスごとに太線
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    const baseX = Math.floor(offsetX / 10) * 10;
    const baseY = Math.floor(offsetY / 10) * 10;
    for (let i = -Math.ceil(range / 10); i <= Math.ceil(range / 10); i++) {
        const wx = baseX + i * 10;
        const p1 = worldToScreen(wx, offsetY - range);
        const p2 = worldToScreen(wx, offsetY + range);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const wy = baseY + i * 10;
        const p3 = worldToScreen(offsetX - range, wy);
        const p4 = worldToScreen(offsetX + range, wy);
        ctx.beginPath();
        ctx.moveTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.stroke();
    }
}

// 城を描画
function drawCastles() {
    castles.forEach(castle => {
        const pos = worldToScreen(castle.x, castle.y);
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(castle.name, pos.x, pos.y - 12);
    });
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
    scale = 5;
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
            btn.textContent = '✕ 全画面解除';
            setTimeout(() => {
                resizeCanvas();
                drawMap();
            }, 100);
        }).catch(err => {
            console.error('全画面表示エラー:', err);
            alert('全画面表示に失敗しました');
        });
    } else {
        document.exitFullscreen().then(() => {
            section.classList.remove('fullscreen-container');
            btn.textContent = '🖼️ 全画面表示';
            setTimeout(() => {
                resizeCanvas();
                drawMap();
            }, 100);
        });
    }
}

// 全画面変更イベントをリッスン
document.addEventListener('fullscreenchange', () => {
    setTimeout(() => {
        resizeCanvas();
        drawMap();
    }, 100);
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
