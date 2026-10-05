if status is-interactive
    set -g fish_greeting

    starship init fish | source
    zoxide init fish | source
    fzf --fish | source

    alias ls 'eza --icons'
    alias ll 'eza -l --icons --git'
    alias la 'eza -la --icons --git'
    alias cat 'bat'

    # Syntax colors (same palette as the bar and kitty)
    set -g fish_color_command a9b8ff
    set -g fish_color_param e8e8f2
    set -g fish_color_quote 8fd4a4
    set -g fish_color_error ff6b81
    set -g fish_color_comment 4a4a5e
    set -g fish_color_operator c9a0ff
    set -g fish_color_escape 7fd6d6
    set -g fish_color_end c9a0ff
    set -g fish_color_autosuggestion 4a4a5e
    set -g fish_color_valid_path --underline
    set -g fish_pager_color_selection_background 2a2a38
end
