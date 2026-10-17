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
end

# Pi
fish_add_path "/home/aaraadhya/.pi/agent/bin"

# Hermes Agent command
fish_add_path "$HOME/.local/bin"
