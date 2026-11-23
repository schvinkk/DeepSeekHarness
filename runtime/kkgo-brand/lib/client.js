// KK Go 品牌插件 —— 浏览器半边。
//
// 背景：上游 dsh 的侧边栏品牌插槽（sidebar.brand.mark / sidebar.brand.name）由
// @deepseek-ai/dsh-client-ui-brand-official 占用，渲染成 "deepseek HARNESS" 字样。
// KK Go 要有自己的辨识度，就在同一组插槽上注册自己的实现，并通过 profile 的
// --patch 覆盖层把官方那条禁用掉，避免两套字样同时出现。
//
// 加载方式与官方插件一致：前端模块系统按 package.json 的 exports["./client"]
// 找到本文件，交给 window.__ModuleLoader__ 注册。
//
// 注意：factory 内部必须自己声明 module/exports（CommonJS 包装），
// 否则工厂体里的 `exports.apply = ...` 会直接抛 "exports is not defined"，
// 前端只会在 console 里报一行 "import failed"，界面却毫无异常 —— 极难排查。
window.__ModuleLoader__.load({
  id: `@deepseek-ai/dsh-client-ui-brand-kkgo`,
  factory: require => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: `Module` });

    const react = require(`react`);

    // 品牌标记：渐变圆角方块 + KK 字样。
    // 尺寸跟随上游 FishLogo 的 size 属性，保证与原版排版对齐。
    function KkGoBrandMark(props) {
      const size = (props && props.size) || 24;
      return react.createElement(
        `span`,
        {
          className: `kkgo-brand-mark`,
          style: {
            display: `inline-flex`,
            alignItems: `center`,
            justifyContent: `center`,
            flex: `0 0 auto`,
            width: size + `px`,
            height: size + `px`,
            borderRadius: Math.round(size * 0.3) + `px`,
            background: `linear-gradient(135deg, #2E7DF7 0%, #6D3BEF 55%, #12B5CB 100%)`,
            color: `#fff`,
            fontWeight: 800,
            fontSize: Math.max(9, Math.round(size * 0.42)) + `px`,
            letterSpacing: `-0.03em`,
            lineHeight: 1,
            userSelect: `none`,
            boxShadow: `0 1px 3px rgba(15,23,42,.28)`
          }
        },
        `KK`
      );
    }

    // 品牌名：KK（重）+ Go（轻），与上游 BrandWordmark 的强弱对比保持一致。
    function KkGoBrandName() {
      return react.createElement(
        `span`,
        {
          className: `kkgo-brand-name`,
          style: {
            display: `inline-flex`,
            alignItems: `baseline`,
            gap: `3px`,
            whiteSpace: `nowrap`,
            userSelect: `none`
          }
        },
        react.createElement(
          `span`,
          { style: { fontWeight: 800, letterSpacing: `-0.02em` } },
          `KK`
        ),
        react.createElement(
          `span`,
          { style: { fontWeight: 500, opacity: 0.85 } },
          `Go`
        )
      );
    }

    const inject = [`slots`];

    function apply(ctx) {
      // 与官方插件同样的嵌套 inject：外层提供注入时机，内层完成两个插槽的注册。
      ctx.slots.inject(`sidebar.brand.mark`, () =>
        ctx.slots.inject(`sidebar.brand.name`, function* () {
          yield ctx.slots.register({ name: `sidebar.brand.mark` }, KkGoBrandMark);
          yield ctx.slots.register({ name: `sidebar.brand.name` }, KkGoBrandName);
        })
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
