use zed_extension_api::{self as zed, settings::LspSettings, LanguageServerId, Result};

struct Dxn;

impl zed::Extension for Dxn {
    fn new() -> Self {
        Dxn
    }

    fn language_server_command(
        &mut self,
        id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        // Zed's settings may name the server and its arguments, under
        // lsp.dxn-lsp.binary.
        let binary = LspSettings::for_worktree(id.as_ref(), worktree)
            .ok()
            .and_then(|settings| settings.binary);
        let configured = binary.as_ref().and_then(|binary| binary.path.clone());
        Ok(zed::Command {
            command: server(configured, worktree.which("dxn-language-server"))?,
            args: binary
                .and_then(|binary| binary.arguments)
                .unwrap_or_default(),
            env: worktree.shell_env(),
        })
    }
}

// The server to start: the one the settings name, or else the one on the
// project's PATH.
fn server(configured: Option<String>, found: Option<String>) -> Result<String> {
    configured.or(found).ok_or_else(|| {
        "dxn-language-server is not on the PATH; install it with \
         `npm install -g @legacycodehq/dxn-language-server`, or set \
         lsp.dxn-lsp.binary.path in Zed's settings"
            .into()
    })
}

zed::register_extension!(Dxn);

#[cfg(test)]
mod tests {
    use super::server;

    #[test]
    fn starts_the_server_the_settings_name_first() {
        assert_eq!(
            server(
                Some("/dev/dxn-language-server".into()),
                Some("/usr/bin/dxn-language-server".into())
            ),
            Ok("/dev/dxn-language-server".into())
        );
    }

    #[test]
    fn otherwise_starts_the_server_on_the_path() {
        assert_eq!(
            server(None, Some("/usr/bin/dxn-language-server".into())),
            Ok("/usr/bin/dxn-language-server".into())
        );
    }

    #[test]
    fn says_how_to_install_the_server_when_there_is_none() {
        let error = server(None, None).unwrap_err();
        assert!(
            error.contains("npm install -g @legacycodehq/dxn-language-server"),
            "{error}"
        );
        assert!(error.contains("lsp.dxn-lsp.binary.path"), "{error}");
    }
}
