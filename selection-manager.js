// ==== Selection Manager - 选中状态管理器 ==== //
// 单例模式，统一管理 Table/Map/Layer Panel/Property Editor 的选中状态

const SelectionManager = (function () {
    let instance = null;

    function createInstance() {
        return {
            currentLayer: null,
            listeners: new Set(),

            // 选中一个图层
            select(layer) {
                if (this.currentLayer === layer) return;

                const previousLayer = this.currentLayer;
                this.currentLayer = layer;

                console.log('SelectionManager: Selected', layer ? (layer.options?.name || L.stamp(layer)) : 'null');

                // 通知所有监听器
                this.notifyListeners({
                    type: 'select',
                    current: layer,
                    previous: previousLayer
                });
            },

            // 取消选中
            deselect() {
                if (!this.currentLayer) return;

                const previousLayer = this.currentLayer;
                this.currentLayer = null;

                console.log('SelectionManager: Deselected');

                this.notifyListeners({
                    type: 'deselect',
                    current: null,
                    previous: previousLayer
                });
            },

            // 获取当前选中的图层
            getSelected() {
                return this.currentLayer;
            },

            // 注册选中变化监听器
            onSelectionChange(callback) {
                this.listeners.add(callback);
                // 返回取消订阅函数
                return () => this.listeners.delete(callback);
            },

            // 通知所有监听器
            notifyListeners(event) {
                this.listeners.forEach(callback => {
                    try {
                        callback(event);
                    } catch (e) {
                        console.error('SelectionManager listener error:', e);
                    }
                });
            },

            // 检查指定图层是否为当前选中
            isSelected(layer) {
                return this.currentLayer === layer;
            },

            // 通过 Leaflet ID 选中
            selectById(leafletId) {
                // 优先从 drawnItems 查找
                if (typeof drawnItems !== 'undefined') {
                    const layer = drawnItems.getLayer(leafletId);
                    if (layer) {
                        this.select(layer);
                        return true;
                    }
                }

                // 从 MarkerGroupManager 查找（包括收起状态的标记）
                if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
                    for (const [marker, group] of markerGroupManager.markerToGroup) {
                        if (L.stamp(marker) === leafletId) {
                            // 如果在收起的组中，先展开
                            if (!group.isExpanded && group.getCount() > 1) {
                                markerGroupManager.expandGroup(group);
                            }
                            this.select(marker);
                            return true;
                        }
                    }
                }

                return false;
            }
        };
    }

    return {
        getInstance() {
            if (!instance) {
                instance = createInstance();
            }
            return instance;
        }
    };
})();

// 全局快捷访问
window.selectionManager = SelectionManager.getInstance();

console.log('SelectionManager module loaded');
