# %% Cell 1: Setup (place cursor anywhere below to see the cell highlighted)
using Random, LinearAlgebra, Statistics
Random.seed!(42)

n, p = 200, 6
X = randn(n, p)
w_true = [1.5, -2.0, 0.0, 0.7, 0.0, 1.0]
y = X * w_true .+ 0.3 .* randn(n)

# %% Cell 2: Ridge regression fit (# %% delimiter)
λ = 0.5
w_hat = (X'X + λ * I) \ (X'y)

rmse(ŷ, y) = sqrt(mean((ŷ .- y) .^ 2))
@show rmse(X * w_hat, y)

## Cell 3: Inspect coefficients (## delimiter)
coef_table = hcat(w_true, w_hat, abs.(w_hat .- w_true))
println("columns: w_true  w_hat  |error|")
display(coef_table)
