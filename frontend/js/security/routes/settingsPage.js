export function render() {
  return `
    <section class="security-route settings-page" data-page-route="settings">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Settings</p>
            <h2>Workspace Preferences</h2>
            <p class="panel__lede">Language, session behavior, and protected workflow preferences remain scoped to this guard workspace.</p>
          </div>
        </div>
        <div class="settings-layout settings-layout--single">
          <form class="settings-form" id="security-settings-form" novalidate>
            <label class="form-field">
              <span>Preferred language</span>
              <select name="preferredLanguage" disabled>
                <option>Use the workspace language control</option>
              </select>
            </label>
            <fieldset class="settings-fieldset">
              <legend>Session persistence</legend>
              <label class="toggle-row"><input type="checkbox" checked disabled /><span>Keep guard session active during route changes</span></label>
              <label class="toggle-row"><input type="checkbox" checked disabled /><span>Preserve role permissions across refresh</span></label>
            </fieldset>
          </form>
        </div>
      </article>
    </section>
  `;
}
