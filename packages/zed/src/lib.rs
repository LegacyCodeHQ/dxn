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
        // lsp.dxn-redesign-language-server.binary.
        let binary = LspSettings::for_worktree(id.as_ref(), worktree)
            .ok()
            .and_then(|settings| settings.binary);
        let configured = binary.as_ref().and_then(|binary| binary.path.clone());
        Ok(zed::Command {
            command: server(configured)?,
            args: binary
                .and_then(|binary| binary.arguments)
                .unwrap_or_default(),
            env: worktree.shell_env(),
        })
    }
}

// A development extension must never start a prototype server found on PATH.
fn server(configured: Option<String>) -> Result<String> {
    configured.filter(|path| !path.is_empty()).ok_or_else(|| {
        "Set lsp.dxn-redesign-language-server.binary.path and arguments to this redesign worktree's built language server; a prototype server on PATH is not used".into()
    })
}

zed::register_extension!(Dxn);

#[cfg(test)]
mod tests {
    use super::server;

    #[test]
    fn starts_only_the_explicit_redesign_server() {
        assert_eq!(
            server(Some("/dev/redesign-server".into())),
            Ok("/dev/redesign-server".into())
        );
    }

    #[test]
    fn requires_a_local_redesign_server() {
        assert!(server(None).unwrap_err().contains("redesign"));
    }
}
