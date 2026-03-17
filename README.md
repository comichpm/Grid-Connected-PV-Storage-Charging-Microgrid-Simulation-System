# 并网光储充系统模拟系统

**Grid-Connected PV-Storage-Charging Microgrid Simulation System**

一套完整的微网仿真系统，包含后端仿真引擎 + Modbus TCP 通讯协议服务 + React Web 前端拖拽画布。

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Web 前端 (React + React Flow)                │
│  ┌──────────┐  ┌──────────────────────┐  ┌───────────────────┐  │
│  │设备面板  │  │   拖拽画布 (Canvas)   │  │  设备配置面板     │  │
│  │(拖拽源)  │  │  Grid / PV / BESS    │  │  参数修改         │  │
│  │          │  │  EV Charger / Load   │  │  Modbus配置       │  │
│  └──────────┘  └──────────────────────┘  │  控制操作         │  │
│                        ↕ WebSocket        └───────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                          ↕ REST API
┌─────────────────────────────────────────────────────────────────┐
│                    后端 (FastAPI + asyncio)                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              仿真引擎 (SimulationEngine)                  │   │
│  │  1秒步进 → 更新设备 → 功率平衡 → 推送WebSocket           │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              功率平衡算法 (PowerBalance)                  │   │
│  │  电网 = -(PV发电 + 储能放电 - 储能充电 - 负荷 - 充电桩)  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              设备模拟器                                   │   │
│  │  Grid | PV | BESS | EVCharger | Load                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Modbus TCP Server (每设备独立端口)                │   │
│  │  Port: 5020+ (Grid=5020, PV=5021, BESS=5022, ...)        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         ↕ Modbus TCP
┌──────────────────────┐
│  外部 EMS / Modbus   │
│  客户端              │
└──────────────────────┘
```

---

## 快速启动

### 方式一：一键脚本（无需 Docker，最简单）✅ 推荐

**前提条件：** Python 3.10+、Node.js 18+、npm

```bash
git clone https://github.com/comichpm/Grid-Connected-PV-Storage-Charging-Microgrid-Simulation-System.git
cd Grid-Connected-PV-Storage-Charging-Microgrid-Simulation-System

# Linux / macOS
chmod +x start.sh && ./start.sh

# Windows
start.bat
```

脚本自动完成：安装 Python 依赖 → 安装前端依赖 → 构建前端 → 启动后端

启动后：
- **系统界面**：http://localhost:8000
- **API 文档**：http://localhost:8000/docs

---

### 方式二：分开手动启动（开发模式）

**后端：**
```bash
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

**前端（另开一个终端）：**
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
# 访问 http://localhost:3000
```

---

### 方式三：Docker 一键部署

```bash
git clone https://github.com/comichpm/Grid-Connected-PV-Storage-Charging-Microgrid-Simulation-System.git
cd Grid-Connected-PV-Storage-Charging-Microgrid-Simulation-System
docker compose up -d
# 前端: http://localhost
# API 文档: http://localhost:8000/docs
```

---

## 使用说明

1. **添加设备** — 从左侧面板拖拽设备到画布（电网、光伏、储能、充电桩、负荷）
2. **连线** — 拖拽节点上的连接点创建电气连接（可视化）
3. **开始模拟** — 点击工具栏 ▶ 开始，所有设备自动仿真运行
4. **配置设备** — 点击节点打开配置面板，修改参数/Modbus/控制操作
5. **速度控制** — 工具栏选择 1×～3600× 仿真速度

---

## REST API

启动后访问 `http://localhost:8000/docs` 查看完整 Swagger 文档。

| 方法   | 路径                      | 说明             |
|--------|---------------------------|------------------|
| GET    | /api/devices/             | 获取所有设备     |
| POST   | /api/devices/             | 创建设备         |
| PUT    | /api/devices/{id}         | 更新设备         |
| DELETE | /api/devices/{id}         | 删除设备         |
| POST   | /api/devices/{id}/control | 控制设备         |
| POST   | /api/simulation/start     | 开始仿真         |
| POST   | /api/simulation/pause     | 暂停仿真         |
| POST   | /api/simulation/stop      | 停止仿真         |
| GET    | /api/simulation/status    | 仿真状态         |
| WS     | /ws                       | 实时数据推送     |

---

## Modbus TCP 寄存器映射表

### 电网 (Grid)

| 地址 | 名称            | 缩放 | 说明                     |
|------|-----------------|------|--------------------------|
| 0    | 在线状态        | —    | 0/1                      |
| 1    | 电网状态        | —    | 0=离线,1=购电,2=售电,3=待机 |
| 2    | 功率 kW         | ×10  | 有符号，+购/-售          |
| 3    | 电压 V          | ×10  |                          |
| 4    | 电流 A          | ×10  |                          |
| 5    | 频率 Hz         | ×100 |                          |
| 6    | 累计购电 kWh    | int  |                          |
| 7    | 累计售电 kWh    | int  |                          |
| 10   | 最大购电 kW     | ×10  | **可写**                 |
| 11   | 最大售电 kW     | ×10  | **可写**                 |

### 储能 (BESS)

| 地址 | 名称            | 缩放  | 说明                              |
|------|-----------------|-------|-----------------------------------|
| 0    | 在线            | —     | **可写**                          |
| 1    | 控制模式        | —     | 0=待机,1=充电,2=放电 **可写**     |
| 2    | 功率设定 kW     | ×10   | **可写**                          |
| 3    | 实际功率 kW     | ×10   | +充/-放                           |
| 4    | SOC %           | ×10   |                                   |
| 7    | 电池电压 V      | ×10   | 600–800V                          |
| 9    | 电池温度 °C     | ×10   |                                   |
| 12   | 累计充电 kWh    | int   |                                   |
| 13   | 累计放电 kWh    | int   |                                   |
| 14   | 循环次数        | ×10   |                                   |
| 16   | 额定容量 kWh    | ×10   |                                   |

### 光伏 (PV)

| 地址 | 名称            | 缩放 | 说明         |
|------|-----------------|------|--------------|
| 0    | 在线            | —    | **可写**     |
| 1    | 功率 kW         | ×10  | 负数=发电    |
| 2    | 辐照度 W/m²     | ×10  |              |
| 3    | 电池温度 °C     | ×10  |              |
| 7    | 限功率比例 %    | ×1   | **可写**     |
| 8    | 日发电量 kWh    | ×10  |              |

### 充电桩 (EV Charger)

| 地址 | 名称            | 缩放 | 说明                          |
|------|-----------------|------|-------------------------------|
| 0    | 在线            | —    | **可写**                      |
| 1    | 枪连接          | —    | 0/1 **可写**                  |
| 2    | 充电状态        | —    | 0=空闲,1=连接,2=充电中,3=满  |
| 3    | 充电功率 kW     | ×10  |                               |
| 4    | 车辆SOC %       | ×10  |                               |
| 8    | 本次电量 kWh    | ×10  |                               |
| 11   | 功率限制 kW     | ×10  | **可写**                      |

### 负荷 (Load)

| 地址 | 名称            | 缩放 | 说明                              |
|------|-----------------|------|-----------------------------------|
| 0    | 在线            | —    | **可写**                          |
| 1    | 负荷模式        | —    | 0=恒定,1=日曲线,2=随机 **可写**   |
| 2    | 实际功率 kW     | ×10  |                                   |
| 3    | 调节比例 %      | ×1   | **可写**                          |
| 6    | 日用电量 kWh    | ×10  |                                   |

---

## Modbus 连接示例

```python
from pymodbus.client import ModbusTcpClient

# 读取储能 SOC
client = ModbusTcpClient('localhost', port=5022)
client.connect()
result = client.read_holding_registers(4, count=1, slave=1)
soc = result.registers[0] / 10.0
print(f"BESS SOC: {soc}%")

# 切换充电模式
client.write_register(1, 1, slave=1)   # 充电模式
client.write_register(2, 500, slave=1)  # 50.0 kW

client.close()
```

---

## 功率平衡原理

```
电网功率 = -(光伏发电 + 储能净功率 + 负荷消耗 + 充电桩消耗)
```

- 光伏功率 < 0（注入）
- 储能放电 < 0（注入），充电 > 0（消耗）
- 负荷、充电桩 > 0（消耗）
- 电网自动平衡：> 0 购电，< 0 售电

---

## 许可证

MIT License
