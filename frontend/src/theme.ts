import type { ThemeConfig } from 'antd';

export const PRIMARY = '#4f46e5';

// Theme chung cho toàn bộ giao diện antd
export const theme: ThemeConfig = {
  token: {
    colorPrimary: PRIMARY,
    colorInfo: PRIMARY,
    colorSuccess: '#16a34a',
    colorWarning: '#f59e0b',
    colorError: '#e5484d',
    borderRadius: 10,
    borderRadiusLG: 16,
    colorBgLayout: '#f4f6fb',
    colorTextBase: '#1e2433',
    colorBorderSecondary: '#e8ecf4',
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Layout: { headerBg: '#ffffff', headerHeight: 64, headerPadding: '0 24px', bodyBg: '#f4f6fb' },
    Menu: {
      itemBorderRadius: 8,
      itemSelectedBg: '#eef0ff',
      itemSelectedColor: PRIMARY,
      horizontalItemSelectedColor: PRIMARY,
      itemHoverBg: '#f3f4f8',
      activeBarHeight: 0,
      activeBarBorderWidth: 0,
    },
    Card: { headerFontSize: 16 },
    Table: { headerBg: '#f8fafc', headerColor: '#475467', rowHoverBg: '#f8f9ff' },
    Button: { fontWeight: 500 },
  },
};