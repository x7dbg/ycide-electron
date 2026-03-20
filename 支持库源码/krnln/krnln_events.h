#ifndef KRNLN_EVENTS_H
#define KRNLN_EVENTS_H

#include "elib/lib2.h"

/*******************************************************************************
 * 窗口组件事件定义
 * 参考 lib2.h 中 EVENT_INFO2 / EVENT_ARG_INFO2 结构体
 *
 * EVENT_INFO2: { m_szName, m_szExplain, m_dwState, m_nArgCount, m_pEventArgInfo, m_dtRetDataType }
 * EVENT_ARG_INFO2: { m_szName, m_szExplain, m_dwState, m_dtDataType }
 *
 * 所有事件的 m_dwState 必须包含 EV_IS_VER2 标志
 ******************************************************************************/

// ========== 共用事件参数数组 ==========

// 鼠标事件参数: 横向位置, 纵向位置, 功能键状态
static EVENT_ARG_INFO2 s_args_mouse[] = {
    {"横向位置", "鼠标水平坐标", 0, SDT_INT},
    {"纵向位置", "鼠标垂直坐标", 0, SDT_INT},
    {"功能键状态", "Shift/Ctrl/Alt功能键状态", 0, SDT_INT},
};

// 键盘事件参数: 键代码, 功能键状态
static EVENT_ARG_INFO2 s_args_key[] = {
    {"键代码", "按键虚拟键代码。可使用 #F1键、#回车键 等键常量进行比较。", 0, SDT_INT},
    {"功能键状态", "功能键状态(1=#Ctrl键状态, 2=#Shift键状态, 4=#Alt键状态)，可通过位与判断。", 0, SDT_INT},
};

// 字符事件参数: 字符代码
static EVENT_ARG_INFO2 s_args_char[] = {
    {"字符代码", "字符的ASCII码", 0, SDT_INT},
};

// 预处理键盘参数: 键代码
static EVENT_ARG_INFO2 s_args_prekey[] = {
    {"键代码", "按键虚拟键代码。可使用 #F1键、#回车键 等键常量进行比较。", 0, SDT_INT},
};

// 滚动条参数: 位置, 方向
static EVENT_ARG_INFO2 s_args_scroll[] = {
    {"位置", "滚动条当前位置", 0, SDT_INT},
    {"方向", "滚动方向(0=横向,1=纵向)", 0, SDT_INT},
};

// 关闭原因参数
static EVENT_ARG_INFO2 s_args_close_reason[] = {
    {"关闭原因", "引起关闭的原因", 0, SDT_INT},
};

// ==================== 窗口 事件 (26) ====================
static EVENT_INFO2 s_evt_Window[] = {
    {"创建完毕",        "窗口创建完毕后触发",               EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"将被销毁",        "窗口即将被销毁时触发",             EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被激活",          "窗口被激活时触发",                 EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被取消激活",      "窗口失去激活状态时触发",           EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"需要重画",        "窗口需要重绘时触发",               EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"可否被关闭",      "窗口尝试关闭时询问是否允许关闭",   EV_IS_VER2, 0, NULL, SDT_BOOL},
    {"尺寸被改变",      "窗口尺寸改变后触发",               EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"位置被改变",      "窗口位置改变后触发",               EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"尝试关闭窗口",    "用户尝试关闭窗口时触发",           EV_IS_VER2, 1, s_args_close_reason, _SDT_NULL},
    {"拖放文件",        "文件被拖放到窗口上时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"按下某键",        "有按键被按下时触发(预处理)。返回假则取消本事件并阻止继续传递，返回真或无返回值则继续传递。", EV_IS_VER2, 1, s_args_prekey, SDT_BOOL},
    {"字符输入",        "有字符输入时触发(预处理)",         EV_IS_VER2, 1, s_args_char, _SDT_NULL},
    {"滚动条位置被改变","滚动条位置发生改变时触发",         EV_IS_VER2, 2, s_args_scroll, _SDT_NULL},
    {"即将弹出菜单",    "右键菜单即将弹出时触发",           EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"鼠标左键被按下",  "鼠标左键在窗口上被按下",           EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"鼠标左键被放开",  "鼠标左键在窗口上被放开",           EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"鼠标右键被按下",  "鼠标右键在窗口上被按下",           EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"鼠标右键被放开",  "鼠标右键在窗口上被放开",           EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"鼠标移动",        "鼠标在窗口上移动",                 EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"按下某键",        "有按键被按下时触发。返回假则取消本事件并阻止继续传递，返回真或无返回值则继续传递。", EV_IS_VER2, 2, s_args_key, SDT_BOOL},
    {"放开某键",        "有按键被放开时触发",               EV_IS_VER2, 2, s_args_key, _SDT_NULL},
    {"字符输入",        "有字符输入时触发",                 EV_IS_VER2, 1, s_args_char, _SDT_NULL},
    {"获得焦点",        "窗口获得输入焦点时触发",           EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"失去焦点",        "窗口失去输入焦点时触发",           EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"鼠标进入",        "鼠标进入窗口区域时触发",           EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"鼠标离开",        "鼠标离开窗口区域时触发",           EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_Window_count = sizeof(s_evt_Window) / sizeof(s_evt_Window[0]);

// ==================== 菜单 事件 (2) ====================
static EVENT_INFO2 s_evt_Menu[] = {
    {"被选择",      "菜单项被选择时触发",               EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"即将弹出",    "子菜单即将弹出时触发",             EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_Menu_count = sizeof(s_evt_Menu) / sizeof(s_evt_Menu[0]);

// ==================== 编辑框 事件 (4) ====================
static EVENT_INFO2 s_evt_EditBox[] = {
    {"内容被改变",          "编辑框内容改变时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"选择被改变",          "选择区域改变时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"滚动条位置被改变",    "滚动条位置改变时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",              "编辑框被双击时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_EditBox_count = sizeof(s_evt_EditBox) / sizeof(s_evt_EditBox[0]);

// ==================== 画板 事件 (2) ====================
static EVENT_INFO2 s_evt_DrawPanel[] = {
    {"鼠标左键被按下",  "鼠标左键被按下时触发",     EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"鼠标左键被放开",  "鼠标左键被放开时触发",     EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
};
static const int s_evt_DrawPanel_count = sizeof(s_evt_DrawPanel) / sizeof(s_evt_DrawPanel[0]);

// ==================== 标签 事件 (2) ====================
static EVENT_INFO2 s_evt_Label[] = {
    {"被单击",      "标签被单击时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",      "标签被双击时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_Label_count = sizeof(s_evt_Label) / sizeof(s_evt_Label[0]);

// ==================== 按钮 事件 (2) ====================
static EVENT_INFO2 s_evt_Button[] = {
    {"被单击",      "按钮被单击时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",      "按钮被双击时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_Button_count = sizeof(s_evt_Button) / sizeof(s_evt_Button[0]);

// ==================== 选择框 事件 (2) ====================
static EVENT_INFO2 s_evt_CheckBox[] = {
    {"被单击",      "选择框被单击时触发",   EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",      "选择框被双击时触发",   EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_CheckBox_count = sizeof(s_evt_CheckBox) / sizeof(s_evt_CheckBox[0]);

// ==================== 单选框 事件 (2) ====================
static EVENT_INFO2 s_evt_RadioBox[] = {
    {"被单击",      "单选框被单击时触发",   EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",      "单选框被双击时触发",   EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_RadioBox_count = sizeof(s_evt_RadioBox) / sizeof(s_evt_RadioBox[0]);

// ==================== 组合框 事件 (10) ====================
static EVENT_INFO2 s_evt_ComboBox[] = {
    {"选择改变",        "选中项改变时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"编辑内容改变",    "编辑区内容改变时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"下拉框打开",      "下拉列表打开时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"下拉框关闭",      "下拉列表关闭时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",          "被双击时触发",             EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"鼠标左键被按下",  "鼠标左键被按下时触发",     EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"鼠标左键被放开",  "鼠标左键被放开时触发",     EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"鼠标移动",        "鼠标移动时触发",           EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"按下某键",        "有按键被按下时触发。返回假则取消本事件并阻止继续传递，返回真或无返回值则继续传递。", EV_IS_VER2, 2, s_args_key, SDT_BOOL},
    {"字符输入",        "有字符输入时触发",         EV_IS_VER2, 1, s_args_char, _SDT_NULL},
};
static const int s_evt_ComboBox_count = sizeof(s_evt_ComboBox) / sizeof(s_evt_ComboBox[0]);

// ==================== 列表框 事件 (4) ====================
static EVENT_INFO2 s_evt_ListBox[] = {
    {"选择被改变",      "选中项改变时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",          "被双击时触发",             EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"鼠标左键被按下",  "鼠标左键被按下时触发",     EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"鼠标右键被按下",  "鼠标右键被按下时触发",     EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
};
static const int s_evt_ListBox_count = sizeof(s_evt_ListBox) / sizeof(s_evt_ListBox[0]);

// ==================== 选择列表框 事件 (6) ====================
static EVENT_INFO2 s_evt_ChkListBox[] = {
    {"选择被改变",      "选中项改变时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",          "被双击时触发",             EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"选择框被改变",    "选择框状态改变时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"鼠标左键被按下",  "鼠标左键被按下时触发",     EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"鼠标右键被按下",  "鼠标右键被按下时触发",     EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"按下某键",        "有按键被按下时触发。返回假则取消本事件并阻止继续传递，返回真或无返回值则继续传递。", EV_IS_VER2, 2, s_args_key, SDT_BOOL},
};
static const int s_evt_ChkListBox_count = sizeof(s_evt_ChkListBox) / sizeof(s_evt_ChkListBox[0]);

// ==================== 横向滚动条 事件 (2) ====================
static EVENT_INFO2 s_evt_HScrollBar[] = {
    {"位置被改变",      "滚动条位置改变时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"滚动完毕",        "滚动操作完成时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_HScrollBar_count = sizeof(s_evt_HScrollBar) / sizeof(s_evt_HScrollBar[0]);

// ==================== 纵向滚动条 事件 (2) ====================
static EVENT_INFO2 s_evt_VScrollBar[] = {
    {"位置被改变",      "滚动条位置改变时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"滚动完毕",        "滚动操作完成时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_VScrollBar_count = sizeof(s_evt_VScrollBar) / sizeof(s_evt_VScrollBar[0]);

// ==================== 滑块条 事件 (2) ====================
static EVENT_INFO2 s_evt_SliderBar[] = {
    {"位置被改变",      "滑块位置改变时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"滚动完毕",        "滑动操作完成时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_SliderBar_count = sizeof(s_evt_SliderBar) / sizeof(s_evt_SliderBar[0]);

// ==================== 选择夹 事件 (6) ====================
static EVENT_INFO2 s_evt_Tab[] = {
    {"选择被改变",      "选中的子夹改变时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被单击",          "被单击时触发",             EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",          "被双击时触发",             EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"鼠标左键被按下",  "鼠标左键被按下时触发",     EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"鼠标右键被按下",  "鼠标右键被按下时触发",     EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"鼠标移动",        "鼠标移动时触发",           EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
};
static const int s_evt_Tab_count = sizeof(s_evt_Tab) / sizeof(s_evt_Tab[0]);

// ==================== 日期框 事件 (2) ====================
static EVENT_INFO2 s_evt_DatePicker[] = {
    {"日期被改变",      "选中日期发生改变时触发",   EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被关闭",          "下拉日历被关闭时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_DatePicker_count = sizeof(s_evt_DatePicker) / sizeof(s_evt_DatePicker[0]);

// ==================== 月历 事件 (2) ====================
static EVENT_INFO2 s_evt_MonthCal[] = {
    {"日期被改变",      "选中日期发生改变时触发",   EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被单击",          "月历被单击时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_MonthCal_count = sizeof(s_evt_MonthCal) / sizeof(s_evt_MonthCal[0]);

// ==================== 驱动器框 事件 (2) ====================
static EVENT_INFO2 s_evt_DriverBox[] = {
    {"选择被改变",      "选中驱动器改变时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",          "被双击时触发",             EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_DriverBox_count = sizeof(s_evt_DriverBox) / sizeof(s_evt_DriverBox[0]);

// ==================== 目录框 事件 (2) ====================
static EVENT_INFO2 s_evt_DirBox[] = {
    {"选择被改变",      "选中目录改变时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",          "被双击时触发",             EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_DirBox_count = sizeof(s_evt_DirBox) / sizeof(s_evt_DirBox[0]);

// ==================== 文件框 事件 (4) ====================
static EVENT_INFO2 s_evt_FileBox[] = {
    {"选择被改变",      "选中文件改变时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",          "被双击时触发",             EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"路径被改变",      "文件路径改变时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"图案被改变",      "文件匹配图案改变时触发",   EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_FileBox_count = sizeof(s_evt_FileBox) / sizeof(s_evt_FileBox[0]);

// ==================== 颜色选择器 事件 (2) ====================
static EVENT_INFO2 s_evt_ColorPicker[] = {
    {"颜色被改变",      "选中颜色改变时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被单击",          "被单击时触发",             EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_ColorPicker_count = sizeof(s_evt_ColorPicker) / sizeof(s_evt_ColorPicker[0]);

// ==================== 调节器 事件 (2) ====================
static EVENT_INFO2 s_evt_Spin[] = {
    {"值被改变",        "调节器值改变时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"到达边界",        "调节器到达边界时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_Spin_count = sizeof(s_evt_Spin) / sizeof(s_evt_Spin[0]);

// ==================== 时钟 事件 (2) ====================
static EVENT_INFO2 s_evt_Timer[] = {
    {"周期事件",        "时钟周期到达时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"时间到",          "定时时间到达时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_Timer_count = sizeof(s_evt_Timer) / sizeof(s_evt_Timer[0]);

// ==================== 数据报 事件 (2) ====================
static EVENT_INFO2 s_evt_UDP[] = {
    {"数据到达",        "有数据到达时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"出错",            "发生错误时触发",           EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_UDP_count = sizeof(s_evt_UDP) / sizeof(s_evt_UDP[0]);

// ==================== 客户 事件 (4) ====================
static EVENT_INFO2 s_evt_Client[] = {
    {"连接成功",        "连接服务器成功时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"数据到达",        "有数据到达时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"连接断开",        "连接断开时触发",           EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"出错",            "发生错误时触发",           EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_Client_count = sizeof(s_evt_Client) / sizeof(s_evt_Client[0]);

// ==================== 服务器 事件 (6) ====================
static EVENT_INFO2 s_evt_Server[] = {
    {"客户进入",        "有客户连接时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"数据到达",        "有数据到达时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"客户离开",        "客户断开连接时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"出错",            "发生错误时触发",           EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"接受连接",        "接受客户连接时触发",       EV_IS_VER2, 0, NULL, SDT_BOOL},
    {"连接建立",        "连接建立完成时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_Server_count = sizeof(s_evt_Server) / sizeof(s_evt_Server[0]);

// ==================== 端口 事件 (4) ====================
static EVENT_INFO2 s_evt_SerialPort[] = {
    {"数据到达",        "有数据到达时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"发送完毕",        "数据发送完毕时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"通信错误",        "通信发生错误时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"端口状态改变",    "端口状态改变时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_SerialPort_count = sizeof(s_evt_SerialPort) / sizeof(s_evt_SerialPort[0]);

// ==================== 表格 事件 (12) ====================
static EVENT_INFO2 s_evt_Grid[] = {
    {"现行行改变",      "当前行改变时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"现行列改变",      "当前列改变时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被单击",          "表格被单击时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",          "表格被双击时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"选择改变",        "选择区域改变时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"自绘单元格",      "自绘单元格时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"行将编辑",        "即将编辑单元格时触发",     EV_IS_VER2, 0, NULL, SDT_BOOL},
    {"编辑完毕",        "编辑单元格完毕时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"按下某键",        "有按键被按下时触发。返回假则取消本事件并阻止继续传递，返回真或无返回值则继续传递。", EV_IS_VER2, 2, s_args_key, SDT_BOOL},
    {"鼠标右键被按下",  "鼠标右键被按下时触发",     EV_IS_VER2, 3, s_args_mouse, _SDT_NULL},
    {"插入行",          "行被插入时触发",           EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"删除行",          "行被删除时触发",           EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_Grid_count = sizeof(s_evt_Grid) / sizeof(s_evt_Grid[0]);

// ==================== 数据源 事件 (6) ====================
static EVENT_INFO2 s_evt_DataSrc[] = {
    {"记录移动",        "当前记录位置移动时触发",   EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"添加记录",        "记录被添加时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"删除记录",        "记录被删除时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"修改记录",        "记录被修改时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"字段改变",        "字段值改变时触发",         EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"刷新完毕",        "数据刷新完毕时触发",       EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_DataSrc_count = sizeof(s_evt_DataSrc) / sizeof(s_evt_DataSrc[0]);

// ==================== 图形按钮 事件 (2) ====================
static EVENT_INFO2 s_evt_PicBtn[] = {
    {"被单击",      "图形按钮被单击时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
    {"被双击",      "图形按钮被双击时触发",     EV_IS_VER2, 0, NULL, _SDT_NULL},
};
static const int s_evt_PicBtn_count = sizeof(s_evt_PicBtn) / sizeof(s_evt_PicBtn[0]);

#endif // KRNLN_EVENTS_H
