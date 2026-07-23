import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import React, { type PropsWithChildren } from 'react';

/**
 * Scopes Ant Design language, tokens, CSS variables, and popup portals to the
 * enterprise experience without changing the legacy AI workspace theme.
 */
const EnterpriseAntdProvider = ({ children }: PropsWithChildren) => (
  <ConfigProvider
    locale={zhCN}
    prefixCls='ll-ant'
    getPopupContainer={(trigger) =>
      (trigger?.closest('.enterprise-shell, .enterprise-login') as HTMLElement | null) ?? document.body
    }
    theme={{
      cssVar: { prefix: 'll-ant' },
      token: {
        colorPrimary: '#2878ff',
        colorText: '#102a43',
        colorTextSecondary: '#6b7f93',
        colorBorder: '#d8e6f5',
        colorBgContainer: '#ffffff',
        colorBgLayout: '#f4f8ff',
        borderRadius: 10,
        borderRadiusLG: 15,
        fontFamily: "'Microsoft YaHei', '微软雅黑', 'Segoe UI', Arial, sans-serif",
      },
      components: {
        Table: { headerBg: '#f8fbff' },
      },
    }}
  >
    <App className='enterprise-ant-app'>{children}</App>
  </ConfigProvider>
);

export default EnterpriseAntdProvider;
